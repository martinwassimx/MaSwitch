# Contributing to MaSwitch

Thank you for your interest in contributing to **MaSwitch**!

---

## 1. Development Prerequisites

- **Operating System**: Windows 10 or Windows 11 (x64)
- **Node.js**: v20 LTS or v22 LTS
- **npm**: v10+

---

## 2. Local Setup

```powershell
# Clone the repository
git clone https://github.com/martinwassimx/MaSwitch.git
cd MaSwitch

# Install dependencies
npm install

# Start the development environment (Vite + Electron)
npm run dev
```

---

## 3. Quality & Verification Checks

Before opening a Pull Request, ensure all checks pass:

```powershell
# 1. TypeScript type checking (Renderer + Electron Main/Preload)
npm run typecheck

# 2. ESLint static analysis
npm run lint

# 3. Automated test suite (Vitest)
npm run test
```

---

## 4. Security & Architecture Guidelines

1. **Zero Plaintext Credentials**: Never store, log, or transmit plaintext passwords, session cookies, or tokens. All Riot credentials must use the Windows DPAPI vault (`electron/services/accounts/riotCredentialVault.ts`).
2. **Official Launcher Respect**: Never modify game binaries, bypass DRM, or interfere with anti-cheat systems (`Vanguard`, `EasyAntiCheat`, `BattlEye`).
3. **Low-End PC Performance**: Avoid heavy background polling, unnecessary dependencies, or continuous network requests.
4. **Electron Sandbox**: Maintain `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false` across all windows.

