import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as eks from '@pulumi/eks';
import * as k8s from '@pulumi/kubernetes';

import { PolicyDocument } from '@pulumi/aws/iam/documents';
import { getDatadogCollectorConfig } from './otel-collector-datadog';
import { getAwsCollectorConfig } from './otel-collector-aws';

// Get the current organization and stack names
const currentOrgName = pulumi.getOrganization();
const currentStackName = pulumi.getStack();

// Grab some configuration values
const config = new pulumi.Config();
const minClusterSize = config.getNumber('minClusterSize') || 3;
const maxClusterSize = config.getNumber('maxClusterSize') || 6;
const desiredClusterSize = config.getNumber('desiredClusterSize') || 3;
const eksNodeInstanceType = config.get('eksNodeInstanceType') || 't3.medium';
// Use the current organization name if none is specified
const baseOrgName = config.get('baseOrgName') || currentOrgName;
const baseProjName = config.get('baseProjName') || 'zephyr-infra';
// Use the current stack name if none is specified
const baseStackName = config.get('baseStackName') || currentStackName;

// Create a StackReference to get Kubeconfig from base stack
const baseSr = new pulumi.StackReference(`${baseOrgName}/${baseProjName}/${baseStackName}`);
const baseVpcId = baseSr.getOutput('vpcId');
const basePrivSubnetIds = baseSr.getOutput('privSubnetIds');
const basePubSubnetIds = baseSr.getOutput('pubSubnetIds');

// Create the EKS cluster
const eksCluster = new eks.Cluster('eks-cluster', {
  vpcId: baseVpcId,
  publicSubnetIds: basePubSubnetIds,
  privateSubnetIds: basePrivSubnetIds,
  instanceType: eksNodeInstanceType,
  desiredCapacity: desiredClusterSize,
  minSize: minClusterSize,
  maxSize: maxClusterSize,
  nodeAssociatePublicIpAddress: false,
  createOidcProvider: true,
});

const certManager = new k8s.yaml.ConfigFile(
  'cert-manager',
  {
    file: './cert-manager.yaml',
  },
  { provider: eksCluster.provider },
);

const accountId = aws.getCallerIdentity().then((caller) => caller.accountId);

if (!pulumi.runtime.isDryRun() && !eksCluster.core.oidcProvider) {
  throw new Error('No OIDC provider found');
}

const issuerId = eksCluster.core.oidcProvider?.url.apply((url) => url.replace(/^https:\/\//, ''));

const adotRole = new aws.iam.Role('adot-role', {
  assumeRolePolicy: pulumi
    .output({ issuerId, accountId })
    .apply(
      ({ issuerId, accountId }): PolicyDocument => ({
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'sts:AssumeRoleWithWebIdentity',
            Effect: 'Allow',
            Principal: {
              Federated: `arn:aws:iam::${accountId}:oidc-provider/${issuerId}`,
            },
            Condition: {
              StringEquals: {
                [`${issuerId}:aud`]: 'sts.amazonaws.com',
                [`${issuerId}:sub`]: 'system:serviceaccount:opentelemetry:opentelemetry-collector',
              },
            },
          },
        ],
      }),
    ),
});

new aws.iam.RolePolicyAttachment('adot-xray-write', {
  role: adotRole,
  policyArn: aws.iam.ManagedPolicy.AWSXRayDaemonWriteAccess,
});

new aws.iam.RolePolicyAttachment('adot-prometheus-write', {
  role: adotRole,
  policyArn: aws.iam.ManagedPolicy.AmazonPrometheusRemoteWriteAccess,
});

new aws.iam.RolePolicyAttachment('adot-cloudwatch-agent-server', {
  role: adotRole,
  policyArn: aws.iam.ManagedPolicy.CloudWatchAgentServerPolicy,
});

const eksProvider = eksCluster.provider;

const operator = new aws.eks.Addon(
  'aws-distro-for-opentelemetry',
  {
    clusterName: eksCluster.eksCluster.name,
    addonName: 'adot',
    serviceAccountRoleArn: adotRole.arn,
    configurationValues: pulumi.jsonStringify({
      collector: {
        serviceAccount: {
          annotations: {
            'eks.amazonaws.com/role-arn': adotRole.arn,
          },
        },
      },
    }),
  },
  { dependsOn: [certManager] },
);

const namespace = new k8s.core.v1.Namespace(
  'opentelemetry',
  {
    metadata: {
      name: 'opentelemetry',
    },
  },
  { provider: eksProvider },
);

const sa = new k8s.core.v1.ServiceAccount(
  'opentelemetry-collector',
  {
    metadata: {
      name: 'opentelemetry-collector',
      namespace: namespace.metadata.name,
      annotations: {
        'eks.amazonaws.com/role-arn': adotRole.arn,
        'eks.amazonaws.com/sts-regional-endpoints': 'true',
      },
    },
  },
  { provider: eksProvider },
);

const clusterRole = new k8s.rbac.v1.ClusterRole(
  'opentelemetry-collector',
  {
    rules: [
      {
        apiGroups: [''],
        resources: ['nodes', 'nodes/proxy', 'services', 'endpoints', 'pods', 'configmaps'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        apiGroups: ['extensions'],
        resources: ['ingresses'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        nonResourceURLs: ['/metrics'],
        verbs: ['get'],
      },
    ],
  },
  { provider: eksProvider },
);

new k8s.rbac.v1.ClusterRoleBinding(
  'opentelemetry-collector',
  {
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: clusterRole.metadata.name,
    },
    subjects: [
      {
        kind: 'ServiceAccount',
        name: sa.metadata.name,
        namespace: namespace.metadata.name,
      },
    ],
  },
  { provider: eksProvider },
);

let collectorConfig: string;
let collectorEnv: any;
if (config.getBoolean('datadogEnabled')) {
  ({ collectorConfig, collectorEnv } = getDatadogCollectorConfig(namespace, eksProvider));
} else {
  ({ collectorConfig, collectorEnv } = getAwsCollectorConfig());
}

new k8s.apiextensions.CustomResource(
  'opentelemetry-collector',
  {
    apiVersion: 'opentelemetry.io/v1alpha1',
    kind: 'OpenTelemetryCollector',
    metadata: {
      namespace: namespace.metadata.name,
      name: 'default',
    },
    spec: {
      image: 'otel/opentelemetry-collector-contrib:0.71.0',
      mode: 'daemonset',
      serviceAccount: sa.metadata.name,
      config: collectorConfig,
      env: collectorEnv,
      // volume mount /var/log/pods in case we want to use the filelog receiver
      volumes: [
        {
          name: 'varlogpods',
          hostPath: {
            path: '/var/log/pods',
          },
        },
      ],
      volumeMounts: [
        {
          name: 'varlogpods',
          mountPath: '/var/log/pods',
          readOnly: true,
        },
      ],
    },
  },
  { dependsOn: [operator], provider: eksProvider },
);


// Export some values for use elsewhere
export const kubeconfig = eksCluster.kubeconfig;
export const nodeSecurityGroup = eksCluster.nodeSecurityGroup.id;
