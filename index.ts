import * as pulumi from "@pulumi/pulumi";
import * as eks from "@pulumi/eks";

// Get the current stack name
const currentStackName = pulumi.getStack();

// Grab some configuration values
const config = new pulumi.Config();
const minClusterSize = config.getNumber("minClusterSize") || 3;
const maxClusterSize = config.getNumber("maxClusterSize") || 6;
const desiredClusterSize = config.getNumber("desiredClusterSize") || 3;
const eksNodeInstanceType = config.get("eksNodeInstanceType") || "t3.medium";
const baseOrgName = config.get("baseOrgName") || "zephyr";
const baseProjName = config.get("baseProjName") || "zephyr-infra";
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
export const nodeSecurityGrp = eksCluster.nodeSecurityGroup.id;
