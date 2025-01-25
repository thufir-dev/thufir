# Use a lightweight base image
FROM ubuntu:22.04

# Install necessary packages
RUN apt-get update && \
    apt-get install -y openssh-server sudo curl && \
    mkdir /var/run/sshd

# Create a user with password authentication
RUN useradd -m -s /bin/bash dummyuser && \
    echo 'dummyuser:password' | chpasswd && \
    echo "dummyuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Expose SSH port
EXPOSE 22

# Add a script to display stats on login
RUN echo "echo 'Welcome! Current Stats:'" >> /home/dummyuser/.bashrc && \
    echo "uptime" >> /home/dummyuser/.bashrc && \
    echo "free -h" >> /home/dummyuser/.bashrc && \
    echo "df -h | grep '^/dev/'" >> /home/dummyuser/.bashrc

# Start the SSH service
CMD ["/usr/sbin/sshd", "-D"]
