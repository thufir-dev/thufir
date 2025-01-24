FROM ubuntu:20.04

# Install dependencies and OpenSSH server
RUN apt-get update && apt-get install -y openssh-server prometheus && \
    mkdir /var/run/sshd

# Configure SSH server
RUN echo "PermitRootLogin yes" >> /etc/ssh/sshd_config && \
    echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config && \
    echo "root:root" | chpasswd

# Expose SSH and Prometheus ports
EXPOSE 22 9090

# Copy Prometheus configuration (optional)
# COPY prometheus.yml /etc/prometheus/prometheus.yml

# Start SSH and Prometheus
CMD ["/bin/sh", "-c", "/usr/sbin/sshd && /usr/bin/prometheus --config.file=/etc/prometheus/prometheus.yml"]
