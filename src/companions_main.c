/*
 * Post-jailbreak companion installer for WK Store.
 *
 * Sent to elfldr after JB. Installs the Elf Launcher homescreen page
 * only when missing, then exits. Does not start the HTTP server and does
 * not autoload any payloads.
 */
#include <stdlib.h>
#include <sys/syscall.h>
#include <unistd.h>

#include "app_installer.h"
#include "wkali.h"

int main(void) {
  syscall(SYS_thr_set_name, -1, "wkal-comp.elf");
  wkali_log("[WKALI] Companion install (Elf Launcher)...\n");
  (void)wkali_install_companions();
  return 0;
}
