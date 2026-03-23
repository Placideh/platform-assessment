import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';
import { Construct } from 'constructs';

interface EksStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  ecrRepository: ecr.Repository;
  eksClusterSg: ec2.SecurityGroup;
  eksNodeSg: ec2.SecurityGroup;
}

export class EksStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: EksStackProps) {
    super(scope, id, props);

    const clusterName =
      this.node.tryGetContext('clusterName') || 'platform-cluster';
    const instanceType =
      this.node.tryGetContext('nodeInstanceType') || 't3.medium';
    const minSize = this.node.tryGetContext('nodeMinSize') || 2;
    const maxSize = this.node.tryGetContext('nodeMaxSize') || 4;
    const desiredSize = this.node.tryGetContext('nodeDesiredSize') || 2;

    // EKS cluster master role
    const clusterRole = new iam.Role(this, 'ClusterRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
      ],
    });

    // kubectl Lambda layer required by CDK to manage the EKS cluster
    const kubectlLayer = new KubectlV31Layer(this, 'KubectlLayer');

    // EKS cluster with security group from NetworkStack
    const cluster = new eks.Cluster(this, 'PlatformCluster', {
      clusterName,
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      defaultCapacity: 0,
      version: eks.KubernetesVersion.V1_31,
      role: clusterRole,
      kubectlLayer,
      securityGroup: props.eksClusterSg,
    });

    // Node group IAM role with ECR pull access
    const nodeRole = new iam.Role(this, 'NodeGroupRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonEKSWorkerNodePolicy',
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonEC2ContainerRegistryReadOnly',
        ),
      ],
    });

    // Grant explicit pull access to our specific ECR repo
    props.ecrRepository.grantPull(nodeRole);

    // Managed node group in private subnets
    cluster.addNodegroupCapacity('PlatformNodes', {
      instanceTypes: [new ec2.InstanceType(instanceType)],
      minSize,
      maxSize,
      desiredSize,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      nodeRole,
      diskSize: 20,
      labels: {
        role: 'platform-worker',
      },
    });

    // Assign to class property after all configuration
    this.cluster = cluster;

    // Tags for all resources in this stack
    cdk.Tags.of(this).add('Project', 'platform-app');
    cdk.Tags.of(this).add('ManagedBy', 'cdk');
    cdk.Tags.of(this).add('Environment', 'production');

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      description: 'EKS cluster name',
      exportName: 'PlatformClusterName',
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: cluster.clusterEndpoint,
      description: 'EKS cluster API endpoint',
      exportName: 'PlatformClusterEndpoint',
    });
  }
}