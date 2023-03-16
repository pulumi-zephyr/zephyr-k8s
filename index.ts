import * as pulumi from "@pulumi/pulumi";
import * as eks from "@pulumi/eks";

// Grab some configuration values
const config = new pulumi.Config();
const minClusterSize = config.getNumber("minClusterSize") || 3;
const maxClusterSize = config.getNumber("maxClusterSize") || 6;
const desiredClusterSize = config.getNumber("desiredClusterSize") || 3;
const eksNodeInstanceType = config.get("eksNodeInstanceType") || "t3.medium";
const infraOrgName = config.get("infraOrgName");
const infraProjName = config.get("infraProjName");
const infraStackName = config.get("infraStackName");

// Create a StackReference to get Kubeconfig from base stack
const infraSr = new pulumi.StackReference(`${infraOrgName}/${infraProjName}/${infraStackName}`);
const infraVpcId = infraSr.getOutput("vpcId");
const infraPrivSubnetIds = infraSr.getOutput("privSubnetIds");
const infraPubSubnetIds = infraSr.getOutput("pubSubnetIds");

// Create the EKS cluster
const eksCluster = new eks.Cluster("eks-cluster", {
    vpcId: infraVpcId,
    publicSubnetIds: infraPubSubnetIds,
    privateSubnetIds: infraPrivSubnetIds,
    // Change configuration values to change any of the following settings
    instanceType: eksNodeInstanceType,
    desiredCapacity: desiredClusterSize,
    minSize: minClusterSize,
    maxSize: maxClusterSize,
    nodeAssociatePublicIpAddress: false,
    // Uncomment the next two lines for a private cluster (VPN access required)
    // endpointPrivateAccess: true,
    // endpointPublicAccess: false
});

// Export some values for use elsewhere
export const kubeconfig = eksCluster.kubeconfig;
