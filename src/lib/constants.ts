// Work data constants
export const experiences = [
  {
    title: "Grepr",
    companyUrl: "https://www.grepr.ai/",
    location: "San Francisco, CA",
    period: "Summer 2025",
    role: "SWE Intern",
    description: [
      "Assisted in building Grepr's new distributed tracing product, handling the query and storage layer for unprocessed traces while maintaining constraints in a distributed systems environment built with Apache Flink, Apache Iceberg, and a React/TypeScript frontend",
      "Built both the OpenTelemetry log and trace integrations, implementing efficient serialization/deserialization with minimal garbage collection, sustaining 10,000+ records/sec across a Kubernetes-orchestrated AWS infrastructure, ensuring low latency and fault tolerance at scale",
      "Wrote and executed database migration scripts on production clusters, ensuring schema consistency and safe rollouts",
      "Built a comprehensive integration test suite in JUnit validating interoperability with Datadog, Splunk, OpenTelemetry, Sumo Logic, and AWS S3"
    ]
  }
];

export const projects = [
  {
    title: "Distributed File System (DFS)",
    type: "Peer-to-Peer Network • Go",
    description: [
      "A decentralized, peer-to-peer distributed file system implementing Content-Addressable Storage (CAS) with AES encryption",
      "Features automatic file replication, fault tolerance, and modular architecture supporting custom transport protocols and storage backends",
      "Built with TCP transport layer and SHA-1 cryptographic hashing for secure file operations across network peers"
    ],
    githubUrl: "https://github.com/navkul/dfs"
  }
];
