#pragma once

/**
 * Launch the PS5 web browser with a specific URL.
 * @param uri The URL to open.
 * @return 0 on success, -1 on failure.
 */
int ps5_launch_browser(const char *uri);

/**
 * Return to the PS5 home screen (closes the WebKit browser cleanly).
 * @return 0 on success, negative on failure.
 */
int ps5_return_to_home(void);

/* Schedule reboot via embedded reboot.elf after /exit (Store only).
 * Marks a flag; call ps5_reboot_elf_run() after MHD stop so the process
 * stays alive long enough for elfldr to accept the ELF. */
int ps5_reboot_console(void);

/* 1 if /exit requested a reboot.elf load. */
int ps5_reboot_elf_pending(void);

/* Write/send reboot.elf to elfldr :9021 then wait for reboot. */
int ps5_reboot_elf_run(void);

/* Write poweroff/reboot/suspend into /data/wkal at Store install. */
int ps5_seed_power_elfs(void);

/* Send poweroff/reboot/suspend ELF to elfldr :9021 (Store UI tiles). */
int ps5_power_action(const char *action);
