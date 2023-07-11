# Zephyr Archaeotech Emporium Online Store - Kubernetes Clusters

This is the source repository for the Pulumi code to manage the Kubernetes clusters that support the online store of the Zephyr Archaeotech Emporium. It's used in [Pulumi's Zephyr series of blog posts](https://www.pulumi.com/blog/iac-recommended-practices-code-organization-and-stacks/) to discuss best practices when using Pulumi to manage infrastructure and applications.

## Deploying with Pulumi

### Prerequisites

To deploy this infrastructure with Pulumi, you need to:

* have the Pulumi CLI installed, and ensure you are signed into a backend;
* have NodeJS installed;
* have the `kubectl` CLI tool installed; and
* have the AWS CLI installed and configured for your AWS account.

### Dependencies

This project has a dependency on the base infrastructure managed by the Pulumi code in [the `zephyr-infra` repository](https://github.com/pulumi/zephyr-infra). You will need to have created a stack from that project and run a successful `pulumi up` before starting here. You will also need to know the organization name, project name, and stack name for the stack that manages the base infrastructure. All of this information can be obtained by running `pulumi stack ls` in the directory where the `zephyr-infra` project resides.

### Instructions

Follow the steps below to deploy a Kubernetes cluster (using EKS on AWS) to support the Zephyr online store:

1. Clone this repository to your local system (if you haven't already).
2. Run `npm install` to install all necessary dependencies.
3. Run `pulumi stack init <name>` to create a new stack. For the smoothest experience, use the same stack name here that was used with the `zephyr-infra` project (see the Dependencies section).
4. (Optional) Run `pulumi config set` to set values for `baseOrgName` (defaults to your current organization), `baseProjName` (defaults to "zephyr-infra"), and `baseStackName` (defaults to your current stack name). Unless you know you need specific values here, the default values are typically sufficient.
5. Run `pulumi up`.

**NOTE:** You'll see `Pulumi.test.yaml` and `Pulumi.prod.yaml` stack files in this repository. These are here for illustrative purposes (to tie back to the Pulumi blog series) and will not impact your ability to use the steps above _unless_ you use a stack name of "test" or "prod" for your stack.

This Pulumi project deploys an EKS cluster. After the stack is finished deploying, use `pulumi stack output` to retrieve the Kubeconfig for the newly-created Kubernetes cluster:

```shell
pulumi stack output kubeconfig > kubeconfig
```

You can then use this Kubeconfig with `kubectl` to interact with the Kubernetes cluster in order to view nodes, Pods, Services, Deployments, ConfigMaps, etc. For example, to view the nodes in the cluster, you would use this command:

```shell
KUBECONFIG=kubeconfig kubectl get nodes
```
