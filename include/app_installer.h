#pragma once

/* 1 when the homescreen page is already on disk. */
int wkali_page_installed(void);

/* Install (or force-refresh) the homescreen page: always rewrite
 * param/icon and call install again when already present. */
int wkali_install_app(void);

/* Install Elf Launcher (ELFL00001) homescreen page when missing.
 * homescreen pages when missing. Does not start servers or autoload. */
int wkali_install_companions(void);

/* Install bundled launcher + elfldr in /data/elf-launcher (not mirror/). */
int wkali_seed_launcher_files(void);
