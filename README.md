# Thufir Extension for Visual Studio Code

Thufir is a Visual Studio Code extension designed to help with server monitoring and management for developers. 
It aims to combine real-time server metrics visualization, integration with Prometheus, and AI-powered root cause analysis 
to provide actionable insights and efficient server management.

---

## Features

### 1. **Server Management**
- Add, remove, connect to, and disconnect from remote servers.
- Secure SSH-based connections.

### 2. **Metrics Collection**
- Gather key server metrics such as:
  - CPU usage
  - Memory usage
  - Disk usage
  - System uptime
  - Load averages
- Metrics are collected via shell commands executed on the server.

### 3. **Real-time Monitoring**
- View metrics updated at a configurable interval (default: 5000 milliseconds).
- Live updates every second in a user-friendly webview panel within VS Code.

### 4. **Integration with Prometheus** (this will be a future feature)
- Fetch and display metrics from Prometheus endpoints.
- Visualize long-term trends and metrics alongside real-time data.
- Simplify server performance monitoring with Prometheus’s robust querying capabilities.

### 5. **AI-Powered Root Cause Analysis** (this will be a future feature)
- Leverage LLMs to analyze server metrics.
- Automatically detect anomalies and identify potential root causes.
- Suggest remediation steps to resolve issues.

### 6. **Integration with VS Code**
- Tree view for server exploration.
- Dedicated panel for detailed metrics visualization.
- Commands accessible via the command palette.

### 7. **Configuration** (this will be a future feature)
- Customizable refresh interval for server metrics.
- User-defined Prometheus configurations.

---

## Installation

1. Open the Extensions view in Visual Studio Code (`Ctrl+Shift+X` or `Cmd+Shift+X` on macOS).
2. Search for `Thufir` and click **Install**.
3. Reload VS Code to activate the extension.

---

## Usage

### Add a Server
1. Open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on macOS).
2. Select `Thufir: Add Server`.
3. Enter the server details (hostname, username, SSH key).

### View Metrics
1. Expand the server tree view in the Explorer pane.
2. Click on a connected server to open the metrics dashboard.
3. Monitor metrics in real-time in the webview panel.

---

## Development

### Prerequisites
- Node.js
- VS Code Extension Development tools

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/thufir.git
   ```
2. Install dependencies:
   ```bash
   cd thufir
   npm install
   ```
3. Launch the extension in a development host:
   ```bash
   code .
   ```
   Press `F5` to start debugging.

---

## Contributing

We welcome contributions! Please follow these steps:
1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Submit a pull request with a detailed description.

---

## License

Thufir is licensed under the [GPLv3.0](LICENSE).

---

## Acknowledgments

Special thanks to the open-source community and the developers behind Prometheus and LLM frameworks.

---

## Contact

For questions, issues, or suggestions, please open an issue on [GitHub](https://github.com/evangelosmeklis/thufir).
