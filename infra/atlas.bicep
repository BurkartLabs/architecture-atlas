// Architecture Atlas: one Container App serving the static site, in the shared orch-env environment (rg-orchestrata,
// Canada Central). Resource-group scope, deployed by deploy.ps1 beside this file. It reads the shared identity,
// registry and environment and changes none of them. No secrets, no storage: everything is in the image.
targetScope = 'resourceGroup'

param location string = resourceGroup().location
param prefix string = 'orch'
@description('<registry>/architecture-atlas:<tag>; deploy.ps1 builds and pushes it.')
param image string
param appName string = 'architecture-atlas'
@description('0 lets the app sleep when idle (a few seconds on the first visit after); 1 keeps it warm.')
param minReplicas int = 0

var suffix = uniqueString(resourceGroup().id)

resource id 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = { name: '${prefix}-identity' }
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = { name: '${prefix}acr${suffix}' }
resource env 'Microsoft.App/managedEnvironments@2024-03-01' existing = { name: '${prefix}-env' }

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${id.id}': {} } }
  properties: {
    environmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 8080, transport: 'auto', allowInsecure: false }
      registries: [ { server: acr.properties.loginServer, identity: id.id } ]
    }
    template: {
      scale: { minReplicas: minReplicas, maxReplicas: 2, rules: [ { name: 'http', http: { metadata: { concurrentRequests: '100' } } } ] }
      containers: [ {
        name: 'web'
        image: image
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        probes: [
          { type: 'Startup', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 2, failureThreshold: 15 }
          { type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 60, failureThreshold: 3 }
        ]
      } ]
    }
  }
}

output siteUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output latestRevision string = app.properties.latestRevisionName
