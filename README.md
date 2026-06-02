# Remote Chat Link

> Real-time bi-directional mirroring of the Antigravity AI Chat panel to a mobile PWA via secure Cloudflare tunnel.

![Version](https://img.shields.io/badge/version-1.0.0-a78bfa)
![Platform](https://img.shields.io/badge/platform-Antigravity%20IDE-0d0d0d)
[![License](https://img.shields.io/badge/license-MIT-22c55e)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-Anbu--2006%2FRemote--Chat--Link-181717?style=flat&logo=github)](https://github.com/Anbu-2006/Remote-Chat-Link)

---

## Remote Chat Link - Enterprise Connection Hub

Remote Chat Link transforms your standard Antigravity IDE into a fully remote-accessible development environment, directly from your mobile device. Built natively on Microsoft's **VS Code Remote Tunnels** infrastructure, it provides zero-configuration, secure, and encrypted access to your workspace.

## Key Features

- **Native Secure Tunnels**: Leverages the official `vscode.dev` tunneling engine—no third-party servers, no port forwarding, no messy firewall rules.
- **True "AnyDesk" Experience**: You don't just see text—you get the *entire* VS Code graphical interface rendering live in your mobile browser. Change AI models, open terminals, edit files, and send prompts instantly.
- **Zero Configuration**: Just click the sidebar icon, authenticate once with GitHub/Microsoft, and you are securely connected.
- **Premium User Interface**: Features a beautiful glassmorphism sidebar guide to walk you through the connection lifecycle smoothly.

## How to Use

1. Open the **Remote Chat Link** sidebar inside Antigravity.
2. **Step 1 (Laptop Auth)**: The extension will automatically generate a secure tunnel and request GitHub/Microsoft authentication. Copy the 8-digit code and click "Open Login Page" to verify your laptop. (You only have to do this once!)
3. **Step 2 (Mobile Connection)**: Once verified, a QR Code will appear in the sidebar. Scan it with your phone to securely launch your workspace.

## Troubleshooting

- **Stuck at "Initializing Secure Tunnel"?** The extension actively hunts down "zombie" processes, but if it hangs, run the `Remote Chat Link: Stop Session` command from the command palette.
- **Connection Refused**: Ensure your Antigravity IDE is allowed through any restrictive corporate VPNs, though the Microsoft Tunnel usually punches through standard NATs seamlessly.

---

## Architecture

```
┌──────────────────────┐          ┌─────────────────────┐
│   Antigravity IDE    │          │    Mobile Device     │
│                      │          │                      │
│  ┌────────────────┐  │  Socket  │  ┌────────────────┐  │
│  │  Chat Bridge   │──┼──.io─────┼──│   PWA Client   │  │
│  └────────────────┘  │  (WSS)   │  └────────────────┘  │
│  ┌────────────────┐  │          │                      │
│  │  Relay Server  │  │          │  Cloudflare Tunnel   │
│  │  (Express)     │──┼──────────┼──(.trycloudflare.com)│
│  └────────────────┘  │          │                      │
│  ┌────────────────┐  │          └─────────────────────┘
│  │  QR Sidebar    │  │
│  └────────────────┘  │
└──────────────────────┘
```

---

## Installation

### From Source

```bash
# 1. Clone the repository
git clone https://github.com/Anbu-2006/Remote-Chat-Link.git
cd Remote-Chat-Link

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build

# 4. Package as .vsix
npm run package
```

### Install the VSIX

```bash
# Using Antigravity CLI
antigravity --install-extension remote-chat-link-1.0.0.vsix

# Or via VS Code
code --install-extension remote-chat-link-1.0.0.vsix
```

---

## Usage

1. **Activate** — Open the Remote Chat Link panel from the activity bar (phone icon)
2. **Scan** — Use your phone camera to scan the QR code displayed in the sidebar
3. **Connect** — The mobile PWA opens automatically with the pairing token
4. **Chat** — All AI chat messages are mirrored in real-time. Type commands from your phone to send them to the IDE.

### Commands

| Command | Description |
|---------|-------------|
| `Remote Chat Link: Start Session` | Start/restart the remote session |
| `Remote Chat Link: Stop Session` | Terminate the session and tunnel |
| `Remote Chat Link: Copy Pairing URL` | Copy the pairing URL to clipboard |

---

## Security

- **Token-Based Auth** — A cryptographic 6-digit session secret is required to connect
- **One-Device Policy** — Once a device connects, all other connection attempts are rejected
- **Ephemeral Tunnels** — Each session generates a unique `.trycloudflare.com` URL that expires when the session ends
- **No Data Storage** — Messages are held in memory only; nothing is persisted to disk

---

## Development

```bash
# Watch mode (auto-recompile on changes)
npm run dev

# Lint
npm run lint
```

### Project Structure

```
├── src/
│   ├── extension.ts      # Extension entry point
│   ├── server.ts         # Express + Socket.io relay server
│   ├── tunnel.ts         # Cloudflare tunnel manager
│   ├── chatBridge.ts     # Chat interception & relay
│   └── pairingView.ts    # Sidebar webview provider
├── public/
│   ├── index.html        # Mobile PWA client
│   ├── manifest.json     # PWA manifest
│   └── sw.js             # Service worker
├── media/
│   └── sidebar-icon.svg  # Activity bar icon
├── package.json
├── tsconfig.json
└── esbuild.js            # Bundle configuration
```

---

## Requirements

- **Antigravity IDE** v1.85.0+
- **Node.js** 18+
- **Internet connection** (for Cloudflare tunnel)

---

## 👤 Maintainer & Author

- **Anbuselvan T.** ([@Anbu-2006](https://github.com/Anbu-2006)) &bull; Founder, Anbutech

---

## License

Released under the [MIT License](LICENSE) &copy; 2026 Anbuselvan T. & Anbutech.
