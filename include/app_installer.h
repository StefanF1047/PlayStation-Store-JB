#pragma once

/* 1 when the WK Autoloader homescreen page is already on disk. */
int wkali_page_installed(void);

/* Install (or force-refresh) the WK Autoloader homescreen page: always rewrite
 * param/icon and call install again when already present. */
int wkali_install_app(void);

/* Install Elf Launcher (ELFL00001) homescreen page when missing, and seed
 * tip EL + elfldr into /data/elf-launcher. Never installs Payload Manager. */
int wkali_install_companions(void);

/* Seed tip + elfldr only (Store builds). No-op elsewhere. */
int wkali_seed_launcher_files(void);
