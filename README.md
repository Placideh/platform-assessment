# Platform Engineer Assessment

Contains a NestJS application — Kubernetes, CI/CD, Infrastructure as Code, Configuration Management, and Observability. Everything runs locally using kind, with GitHub Actions deploying to the local cluster via ngrok.

## Project Structure

```
platform-assessment/
├── app/                                  ← NestJS application
│   ├── src/
│   │   ├── main.ts                       ← App bootstrap with graceful shutdown
│   │   ├── app.module.ts                 ← Root module, imports all feature modules
│   │   ├── common/
│   │   │   ├── common.controller.ts      ← GET / → { message: "Hello from Platform Engineer!" }
│   │   │   └── common.module.ts
│   │   ├── health/
│   │   │   ├── health.controller.ts      ← GET /health → { status: "ok" }
│   │   │   └── health.module.ts
│   │   └── metrics/
│   │       ├── metrics.controller.ts     ← GET /metrics → Prometheus metrics
│   │       ├── metrics.module.ts
│   │       └── metrics.service.ts        ← HTTP request counter + duration histogram
│   ├── test/
│   │   └── app.e2e-spec.ts              ← E2E tests for all three endpoints
│   ├── Dockerfile                        ← Multi-stage build, non-root user
│   └── package.json
├── infra/                                ← AWS CDK (Infrastructure as Code)
│   ├── bin/main.ts                       ← Stack instantiation with cross-stack deps
│   ├── lib/
│   │   ├── network-stack.ts              ← VPC, subnets, NAT gateway, security groups
│   │   ├── ecr-stack.ts                  ← Private ECR repository
│   │   └── eks-stack.ts                  ← EKS cluster + managed node group
│   ├── cdk.json                          ← Context values (no hardcoded IDs)
│   └── cdk.out/                          ← Generated CloudFormation templates
├── ansible/                              ← Configuration Management
│   ├── inventory/hosts.yaml              ← Host groups with variable-based addresses
│   ├── roles/
│   │   ├── common/                       ← Server hardening role
│   │   └── monitoring/                   ← Node Exporter installation role
│   ├── site.yaml                         ← Master playbook
│   ├── ansible.cfg
│   └── Dockerfile.target                 ← SSH-enabled container for local testing
├── k8s/                                  ← Kubernetes manifests
│   ├── app/
│   │   ├── deployment.yaml               ← 2 replicas, health probes, resource limits
│   │   ├── service.yaml                  ← ClusterIP service
│   │   └── ingress.yaml                  ← NGINX ingress with host rule
│   └── monitoring/
│       ├── prometheus-values.yaml        ← Scrape config + alert rules
│       ├── grafana-values.yaml           ← Dashboard provisioning
│       └── dashboard-configmap.yaml      ← Grafana dashboard JSON
├── .github/workflows/
│   ├── ci.yaml                           ← Lint → Test → Build → Push to DockerHub
│   └── deploy.yaml                       ← Deploy to K8s via ngrok
├── .docs/
│   ├── grafana-dashboard.png           ← Grafana Platform App Overview
│   ├── grafana-loki-logs                ← Platform App : Loki Logs 
├── kind-config.yaml                      ← Kind cluster config (3 nodes, ingress-ready)
└── README.md
```

## Prerequisites

| Tool       | Version  | Install                                          |
|------------|----------|--------------------------------------------------|
| Docker     | ≥ 24.x   | https://docs.docker.com/get-docker/              |
| kubectl    | ≥ 1.28   | https://kubernetes.io/docs/tasks/tools/          |
| Helm       | ≥ 3.14   | https://helm.sh/docs/intro/install/                              |
| kind       | ≥ 0.23   | https://kind.sigs.k8s.io/docs/user/quick-start/                              |
| Node.js    | ≥ 20.x   | https://nodejs.org/                              |
| AWS CDK    | ≥ 2.170  | `npm install -g aws-cdk`                         |
| Ansible    | ≥ 2.16   | `pip install ansible`                            |
| ngrok      | ≥ 3.20   | `brew install ngrok` + sign up at https://ngrok.com |

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/Placideh/platform-assessment.git
cd platform-assessment
cd app && npm install && cd ..
```

### 2. Create the kind cluster

```bash
kind create cluster --config kind-config.yaml
```

Creates a 3-node cluster (1 control-plane + 2 workers) with ingress port mappings.

### 3. Install NGINX Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

### 4. Deploy the application

```bash
kubectl apply -f k8s/app/
kubectl get pods -l app=platform-app
```

### 5. Verify

```bash
kubectl port-forward svc/platform-app 3000:3000 &
curl http://localhost:3000/           # { "message": "Hello from Platform Engineer!" }
curl http://localhost:3000/health     # { "status": "ok" }
curl http://localhost:3000/metrics    # Prometheus metrics
```

### 6. Deploy monitoring

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack \
  -f k8s/monitoring/prometheus-values.yaml \
  -f k8s/monitoring/grafana-values.yaml \
  --namespace monitoring --create-namespace
kubectl apply -f k8s/monitoring/dashboard-configmap.yaml
```

Access Grafana:

```bash
kubectl port-forward svc/monitoring-grafana 3001:80 -n monitoring
# Open http://localhost:3001 — login: admin / prom-operator
```

### 7. CDK Synth

```bash

cdk --version

cd infra && npm install && cdk synth && cd ..
```

Generated CloudFormation templates are committed in `infra/cdk.out/`.

### 8. Run Ansible

```bash
cd ansible
docker build -t ansible-target -f Dockerfile.target .
docker run -d --name ansible-target -p 2222:22 ansible-target

ANSIBLE_TARGET_HOST=127.0.0.1 ANSIBLE_TARGET_PORT=2222 \
ansible-playbook -i inventory/hosts.yaml site.yaml \
  --extra-vars "ansible_password=ansible ansible_user=root" -v

docker stop ansible-target && docker rm ansible-target
cd ..
```

## CI/CD Pipeline

Two separate workflows handle the pipeline:

**`ci.yaml`** triggers on every push to main:

```
Lint → E2E Tests → Build Docker Image (amd64 + arm64) → Push to DockerHub
```

**`deploy.yaml`** triggers automatically after CI passes:

```
Deploy app to K8s via ngrok → Update image → Verify rollout
```

If CI fails, the deploy workflow does not run.

### How deployment reaches the local cluster

GitHub Actions cloud runners cannot reach a local kind cluster. This is solved by exposing the Kubernetes API server via **ngrok**, a TCP tunneling service. The deploy workflow decodes a kubeconfig (stored as a GitHub secret) that points to the ngrok tunnel URL, then runs `kubectl` commands through it.

```
Push to main → CI (GitHub cloud) → Deploy (GitHub cloud) → ngrok tunnel → local kind cluster
```

This demonstrates a fully automated CI/CD pipeline using real GitHub Actions rather than local simulation with `act`. In production, ngrok would be replaced by direct connectivity to EKS via OIDC authentication.

**ngrok limitation:** The free tier assigns a new URL on each restart. When ngrok restarts, the `KUBECONFIG_DATA` secret must be regenerated. As long as the ngrok terminal stays open, the tunnel persists and deployments work automatically on every push.

### Setting up ngrok

**Step 1:** Find the cluster API port and start the tunnel

```bash
docker ps | grep control-plane
# Look for: 127.0.0.1:PORT->6443/tcp

ngrok tcp PORT
# Note the URL: tcp://X.tcp.ngrok.io:XXXXX
```

**Step 2:** Generate the kubeconfig

```bash
kubectl config view --raw --minify --context=kind-platform > /tmp/kc.yaml

sed -i '' 's|server: https://127.0.0.1:PORT|server: https://X.tcp.ngrok.io:XXXXX|' /tmp/kc.yaml
sed -i '' 's|certificate-authority-data:.*|insecure-skip-tls-verify: true|' /tmp/kc.yaml
```

**Step 3:** Test, encode, and add to GitHub

```bash
# Test -- run each command one after another separately
KUBECONFIG=/tmp/kc.yaml kubectl get nodes

# Encode and copy 
base64 -i /tmp/kc.yaml | tr -d '\n' | pbcopy

# Cleanup
rm /tmp/kc.yaml
```

Add to GitHub repo → Settings → Secrets → `KUBECONFIG_DATA` (paste from clipboard).

### GitHub Secrets

| Secret              | Description                              |
|---------------------|------------------------------------------|
| `DOCKERHUB_USERNAME`| DockerHub username                       |
| `DOCKERHUB_TOKEN`   | DockerHub access token                   |
| `KUBECONFIG_DATA`   | Base64-encoded kubeconfig (ngrok tunnel) |

## Infrastructure as Code (CDK)

Three CDK stacks written in TypeScript, each in its own file:

**NetworkStack** — VPC with public and private subnets across 2 AZs, NAT gateway for private subnet egress. Three security groups control traffic: EKS control plane (443 from worker nodes), worker nodes (inter-node communication + control plane access), and application (port 3000 + Prometheus scraping). All ports are configurable via `cdk.json` context.

**EcrStack** — Private ECR repository with image scanning on push, immutable tags, and a lifecycle policy retaining the last 20 images.

**EksStack** — EKS cluster (v1.31) with a managed node group (t3.medium, 2-4 nodes) in private subnets. Worker node IAM role has ECR pull access. References security groups from NetworkStack.

All values come from `cdk.json` context — no hardcoded account IDs, regions, or resource names. All resources tagged with Project, ManagedBy, and Environment. Running `cdk synth` produces CloudFormation templates in `cdk.out/` without needing an AWS account.

## Ansible Roles

**common** (applied to all hosts):
- Creates non-root deploy user with passwordless sudo
- Disables root SSH login and password authentication
- Installs essential packages (curl, ufw, sudo)
- Sets timezone to Africa/Kigali
- Configures system file descriptor limits
- SSH restarts only when configuration changes (handler pattern)

**monitoring** (applied to monitoring group):
- Creates dedicated system user for Node Exporter
- Downloads and installs binary from GitHub releases
- Generates systemd service file from Jinja2 template
- Enables service to start on boot with auto-restart on failure
- Cleans up downloaded archives

Both roles are idempotent — running twice produces zero changes on the second run. The Ansible target is a Docker container with SSH enabled (`Dockerfile.target`), simulating a real EC2 instance provisioned by CDK.

## Monitoring & Observability

### Application metrics (prom-client)

The `/metrics` endpoint exposes:
- `http_requests_total` — request count by method, route, status code
- `http_request_duration_seconds` — latency histogram
- Default Node.js metrics (event loop, heap, GC)

### Alert rules

| Alert               | Condition                              | Severity |
|---------------------|----------------------------------------|----------|
| PodNotReady         | Pod unready > 2 minutes                | warning  |
| HighErrorRate       | 5xx rate > 5% over 5 minutes          | critical |
| HighResponseLatency | p95 latency > 1 second over 5 minutes | warning  |

### Grafana dashboard

Pre-provisioned dashboard with four panels: HTTP request rate by method/route, p95 latency by route, pod CPU usage, and pod memory usage.

## Design Decisions

**NestJS over plain Express** — Modular architecture with dependency injection. Each feature (health, metrics, root endpoint) is an isolated module injected into AppModule. The MetricsModule is `@Global()` so the middleware tracks requests across all routes without coupling.

**kind over minikube** — Runs entirely in Docker with no VM overhead. Starts in seconds. The 3-node cluster simulates a realistic production topology.

**DockerHub over local registry** — Images are publicly verifiable with commit SHA tags. Reviewers can pull and inspect them directly.

**ngrok over act** — Real GitHub Actions with real cloud runners, deploying to a real local cluster. This demonstrates the full CI/CD lifecycle rather than simulating it locally. The trade-off is the ngrok URL dependency, which would not exist in production where the cluster (EKS) is directly reachable.

**Separate CI and Deploy workflows** — CI runs independently on every push. Deploy triggers only after CI succeeds. This separation means CI can pass even if the local cluster is temporarily unreachable.

**CDK context values** — All infrastructure parameters are configurable through `cdk.json`. Stacks have explicit cross-stack dependencies (EKS depends on Network and ECR).

**Ansible roles over flat playbook** — Role-based organization with defaults, handlers, and templates follows Ansible best practices. Variables are separated from logic. Handlers ensure services restart only when configurations actually change.


## Possible Improvements

- **Deploy to AWS** — Run `cdk deploy` to provision real infrastructure and observe the full CDK lifecycle (VPC, EKS, ECR) working end-to-end
- **Helm chart for the app** — Replace raw K8s manifests with a Helm chart supporting multiple environments via values files

- **Grafana Loki** — Add structured JSON logging with log aggregation alongside Prometheus metrics

- **Secret management** — Integrate with AWS Secrets Manager or HashiCorp Vault instead of Kubernetes env vars and GitHub secrets
- **Load testing** — Add Locust to validate performance under load and trigger alert rules
- **Multi-environment support** — Separate dev, staging, and production configurations with environment-specific values

## References

- [NestJS Documentation](https://docs.nestjs.com/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [Ansible Documentation](https://docs.ansible.com/ansible/latest/)
- [Ansible Roles](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html)
- [kind - Kubernetes in Docker](https://kind.sigs.k8s.io/)
- [Helm Documentation](https://helm.sh/docs/)
- [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Kubernetes Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [Prometheus Operator / kube-prometheus-stack](https://github.com/prometheus-operator/kube-prometheus)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- [prom-client (Node.js Prometheus client)](https://github.com/siimon/prom-client)
- [ngrok Documentation](https://ngrok.com/docs/start)
- [Docker Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)