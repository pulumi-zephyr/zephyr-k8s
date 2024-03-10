import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';

export function getDatadogCollectorConfig(namespace: k8s.core.v1.Namespace, provider: k8s.Provider) {
  const config = new pulumi.Config();

  const secret = new k8s.core.v1.Secret(
    'datadog-apikey',
    {
      metadata: {
        name: 'datadog-apikey',
        namespace: namespace.metadata.name,
      },
      stringData: {
        apiKey: config.require('datadogApiKey'),
      },
    },
    { provider },
  );

  const collectorConfig = `
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  hostmetrics:
    collection_interval: 10s
    scrapers:
      paging:
        metrics:
          system.paging.utilization:
            enabled: true
      cpu:
        metrics:
          system.cpu.utilization:
            enabled: true
      disk:
      filesystem:
        metrics:
          system.filesystem.utilization:
            enabled: true
      load:
      memory:
      network:
      processes:
  # The prometheus receiver scrapes metrics needed for the OpenTelemetry Collector Dashboard.
  prometheus:
    config:
      scrape_configs:
      - job_name: 'otelcol'
        scrape_interval: 10s
        static_configs:
        - targets: ['0.0.0.0:8888']

  filelog:
    include_file_path: true
    poll_interval: 500ms
    include:
      - /var/log/pods/**/*.log

processors:
  k8sattributes:
  batch:
    send_batch_max_size: 100
    send_batch_size: 10
    timeout: 10s

exporters:
  awsxray:
  datadog:
    api:
      site: datadoghq.com
      key: \${env:DD_API_KEY}

extensions:
  awsproxy:

service:
  extensions: [awsproxy]
  pipelines:
    logs:
      receivers: [otlp, filelog]
      processors: [batch]
      exporters: [datadog]
    metrics:
      receivers: [hostmetrics, otlp]
      processors: [k8sattributes, batch]
      exporters: [datadog]
    traces:
      receivers: [otlp]
      processors: [k8sattributes, batch]
      exporters: [awsxray, datadog]
  `.trim();

  const collectorEnv = [
    {
      name: 'DD_API_KEY',
      valueFrom: {
        secretKeyRef: {
          name: secret.metadata.name,
          key: 'apiKey',
        },
      },
    },
  ];

  return { collectorConfig, collectorEnv };
}
