# PhotonForge - PhotoPrism with NVIDIA OpenCL support for Darktable RAW demosaicing
FROM photoprism/photoprism:latest

# Register the NVIDIA OpenCL ICD (driver libs are injected at runtime by
# nvidia-container-toolkit; only the vendor descriptor file is missing)
RUN mkdir -p /etc/OpenCL/vendors && \
    echo libnvidia-opencl.so.1 > /etc/OpenCL/vendors/nvidia.icd

# Enable Darktable OpenCL processing (darktable-cli reads $HOME/.config/darktable/darktablerc)
COPY config/darktable/darktablerc /root/.config/darktable/darktablerc
