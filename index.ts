import * as pulumi from "@pulumi/pulumi";
import * as eks from "@pulumi/eks";

// Get the current organization and stack names
const currentOrgName = pulumi.getOrganization();
const currentStackName = pulumi.getStack();

// Grab some configuration values
const config = new pulumi.Config();
const minClusterSize = config.getNumber("minClusterSize") || 3;
const maxClusterSize = config.getNumber("maxClusterSize") || 6;
const desiredClusterSize = config.getNumber("desiredClusterSize") || 3;
const eksNodeInstanceType = config.get("eksNodeInstanceType") || "t3.medium";
// Use the current organization name if none is specified
const baseOrgName = config.get("baseOrgName") || currentOrgName;
const baseProjName = config.get("baseProjName") || "zephyr-infra";
// Use the current stack name if none is specified
const baseStackName = config.get("baseStackName") || currentStackName;

// Create a StackReference to get Kubeconfig from base stack
const baseSr = new pulumi.StackReference(`${baseOrgName}/${baseProjName}/${baseStackName}`);
const baseVpcId = baseSr.getOutput("vpcId");
const basePrivSubnetIds = baseSr.getOutput("privSubnetIds");
const basePubSubnetIds = baseSr.getOutput("pubSubnetIds");

// Create the EKS cluster
const eksCluster = new eks.Cluster("eks-cluster", {
    vpcId: baseVpcId,
    publicSubnetIds: basePubSubnetIds,
    privateSubnetIds: basePrivSubnetIds,
    instanceType: eksNodeInstanceType,
    desiredCapacity: desiredClusterSize,
    minSize: minClusterSize,
    maxSize: maxClusterSize,
    nodeAssociatePublicIpAddress: false,
});

// Export some values for use elsewhere
export const kubeconfig = eksCluster.kubeconfig;
export const nodeSecurityGroup = eksCluster.nodeSecurityGroup.id;
