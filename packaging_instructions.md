# VSIX Packaging Instructions

```bash
# 1. Install VS Code Extension Manager globally (if you haven't already)
npm install -g @vscode/vsce

# 2. Compile and bundle the project
npm run build

# 3. Generate the .vsix package
npx @vscode/vsce package --no-dependencies --allow-missing-repository
```
