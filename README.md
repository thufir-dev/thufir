# Thufir - AI-Powered Server Monitoring for VS Code

![Thufir](resources/thufir_readme.png)

Thufir is an open-source VS Code extension that combines server monitoring with AI assistance and agents to help developers manage and troubleshoot their servers efficiently.

## Features

### Server Management
- Add and manage multiple servers via SSH
- Real-time monitoring of server metrics:
  - CPU usage
  - Memory usage
  - Disk usage
  - System uptime
  - Load averages

### Prometheus Integration
- Connect to local or remote Prometheus instances
- View and analyze Prometheus metrics
- Monitor custom metrics and alerts

### AI Assistant
- Built-in chat interface (Ctrl+L / Cmd+L)
- Multiple LLM providers supported:
  - OpenAI (GPT-4, GPT-3.5)
  - Anthropic (Claude 3)
  - Google (Gemini Pro)
- Analyze server metrics and alerts
- Get AI-powered recommendations

### SRE Tools
- Analyze server performance
- Investigate incidents
- Optimize system performance
- Security auditing
- Backup & recovery planning

## Installation

1. Install from VS Code Marketplace (coming soon)
2. Or install manually:
   ```bash
   git clone https://github.com/thufir-dev/thufir.git
   cd thufir
   npm install
   npm run compile
   ```

## Usage

1. Open the Server Monitoring view in VS Code's activity bar
2. Add a server using SSH credentials or connect to local Prometheus
3. View real-time metrics in the Metrics panel
4. Use Ctrl+L (Cmd+L on Mac) to open the AI Assistant
5. Configure your preferred AI provider in settings

## Configuration

- Set your preferred AI provider (OpenAI, Anthropic, or Google)
- Configure Prometheus endpoints
- Customize metric refresh intervals
- Secure storage of API keys and credentials

## License

[GPLv3.0](LICENSE)

## Contributing

Issues and pull requests are welcome! Check out our [contribution guidelines](CONTRIBUTING.md).

## Author

The Thufir extension is originally written by Evangelos Meklis