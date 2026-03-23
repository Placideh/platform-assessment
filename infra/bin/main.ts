#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { EcrStack } from '../lib/ecr-stack';
import { EksStack } from '../lib/eks-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT || '123456789012',
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const networkStack = new NetworkStack(app, 'NetworkStack', { env });

const ecrStack = new EcrStack(app, 'EcrStack', { env });

new EksStack(app, 'EksStack', {
  env,
  vpc: networkStack.vpc,
  ecrRepository: ecrStack.repository,
  eksClusterSg: networkStack.eksClusterSg,
  eksNodeSg: networkStack.eksNodeSg,
});

app.synth();