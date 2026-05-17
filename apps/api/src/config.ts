try {
  process.loadEnvFile()
}
catch {
  // No .env file at CWD. Fine for tests/CI; the startup gate in index.ts
  // will catch the missing env var when it's actually required.
}

export const githubClientId = process.env['PRQ_GITHUB_CLIENT_ID'] ?? ''
