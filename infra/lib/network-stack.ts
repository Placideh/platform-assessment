import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly eksClusterSg: ec2.SecurityGroup;
  public readonly eksNodeSg: ec2.SecurityGroup;
  public readonly appSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcCidr = this.node.tryGetContext('vpcCidr') || '10.0.0.0/16';
    const appPort = this.node.tryGetContext('appPort') || 3000;
    const prometheusPort = this.node.tryGetContext('prometheusPort') || 9090;
    const nodeExporterPort = this.node.tryGetContext('nodeExporterPort') || 9100;

    this.vpc = new ec2.Vpc(this, 'PlatformVpc', {
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ---- Security Groups ----

    // EKS Control Plane security group
    // Controls access to the Kubernetes API server
    this.eksClusterSg = new ec2.SecurityGroup(this, 'EksClusterSg', {
      vpc: this.vpc,
      description: 'Security group for EKS control plane',
      allowAllOutbound: true,
    });

    // EKS Worker Node security group
    // Controls traffic to/from worker nodes
    this.eksNodeSg = new ec2.SecurityGroup(this, 'EksNodeSg', {
      vpc: this.vpc,
      description: 'Security group for EKS worker nodes',
      allowAllOutbound: true,
    });

    // Application security group
    // Controls traffic to the application running in pods
    this.appSg = new ec2.SecurityGroup(this, 'AppSg', {
      vpc: this.vpc,
      description: 'Security group for platform application',
      allowAllOutbound: true,
    });

    // Control plane ↔ Worker node communication
    // Nodes need to talk to the API server and vice versa
    this.eksClusterSg.addIngressRule(
      this.eksNodeSg,
      ec2.Port.tcp(443),
      'Allow worker nodes to communicate with control plane',
    );

    this.eksNodeSg.addIngressRule(
      this.eksClusterSg,
      ec2.Port.tcpRange(1025, 65535),
      'Allow control plane to communicate with worker nodes',
    );

    // Worker node ↔ Worker node communication
    // Pods on different nodes need to reach each other
    this.eksNodeSg.addIngressRule(
      this.eksNodeSg,
      ec2.Port.allTraffic(),
      'Allow inter-node communication',
    );

    // Application ingress rules
    // Allow HTTP traffic from within the VPC
    this.appSg.addIngressRule(
      ec2.Peer.ipv4(vpcCidr),
      ec2.Port.tcp(appPort),
      'Allow application traffic from within VPC',
    );

    // Allow Prometheus to scrape metrics from the app
    this.appSg.addIngressRule(
      ec2.Peer.ipv4(vpcCidr),
      ec2.Port.tcp(prometheusPort),
      'Allow Prometheus scraping from within VPC',
    );

    // Allow Node Exporter access from within the VPC
    this.eksNodeSg.addIngressRule(
      ec2.Peer.ipv4(vpcCidr),
      ec2.Port.tcp(nodeExporterPort),
      'Allow Node Exporter scraping from within VPC',
    );

    // Tags
    cdk.Tags.of(this).add('Project', 'platform-app');
    cdk.Tags.of(this).add('ManagedBy', 'cdk');
    cdk.Tags.of(this).add('Environment', 'production');

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: 'PlatformVpcId',
    });

    new cdk.CfnOutput(this, 'PrivateSubnets', {
      value: this.vpc.privateSubnets.map((s) => s.subnetId).join(','),
      description: 'Private subnet IDs',
      exportName: 'PlatformPrivateSubnets',
    });

    new cdk.CfnOutput(this, 'PublicSubnets', {
      value: this.vpc.publicSubnets.map((s) => s.subnetId).join(','),
      description: 'Public subnet IDs',
      exportName: 'PlatformPublicSubnets',
    });

    new cdk.CfnOutput(this, 'EksClusterSgId', {
      value: this.eksClusterSg.securityGroupId,
      description: 'EKS cluster security group ID',
      exportName: 'PlatformEksClusterSgId',
    });

    new cdk.CfnOutput(this, 'EksNodeSgId', {
      value: this.eksNodeSg.securityGroupId,
      description: 'EKS node security group ID',
      exportName: 'PlatformEksNodeSgId',
    });

    new cdk.CfnOutput(this, 'AppSgId', {
      value: this.appSg.securityGroupId,
      description: 'Application security group ID',
      exportName: 'PlatformAppSgId',
    });
  }
}