/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Modules must not depend on each other in cycles.",
      from: {},
      to: { circular: true },
    },
    {
      name: "routes-no-upward",
      severity: "error",
      comment: "Routes are composition entry points; app modules should not import route modules.",
      from: { path: "^src/(components|hooks|lib|integrations)/" },
      to: { path: "^src/routes/" },
    },
    {
      name: "components-no-routes",
      severity: "error",
      comment: "Components must remain route-agnostic.",
      from: { path: "^src/components/" },
      to: { path: "^src/routes/" },
    },
    {
      name: "ui-is-leaf",
      severity: "error",
      comment:
        "Base UI components should not depend on app, routing, hooks, or external integration layers.",
      from: { path: "^src/components/ui/" },
      to: {
        path: "^src/(routes|hooks|integrations)/|^src/components/(?!ui/)",
      },
    },
    {
      name: "lib-no-ui-or-routes",
      severity: "error",
      comment: "Shared lib modules should not depend on UI components or routes.",
      from: { path: "^src/lib/" },
      to: { path: "^src/(routes|components)/" },
    },
    {
      name: "hooks-no-routes",
      severity: "error",
      comment: "Hooks may be reused across routes and must not import route modules.",
      from: { path: "^src/hooks/" },
      to: { path: "^src/routes/" },
    },
    {
      name: "integrations-no-app",
      severity: "error",
      comment: "External integrations are a lower layer and must not import app/UI modules.",
      from: { path: "^src/integrations/" },
      to: { path: "^src/(routes|components|hooks|lib)/" },
    },
    {
      name: "server-no-client-routes",
      severity: "error",
      comment: "Server entrypoints should not import client route or component modules directly.",
      from: { path: "^src/server\\.ts$" },
      to: { path: "^src/(routes|components)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+",
      },
    },
  },
};
