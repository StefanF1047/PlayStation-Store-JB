#include <ps5/kernel.h>

#include <stdint.h>

#include <stdio.h>

#include <string.h>

#include <unistd.h>

#include "wkali.h"

#include "ps5_launcher.h"

#include <pthread.h>

#include <unistd.h>

#include <sys/syscall.h>

extern int sceSystemServiceLaunchWebBrowser(const char *uri);

extern int sceKernelLoadStartModule(const char *path, size_t args, const void *argp,

                                    uint32_t flags, const void *pOpt, int *pRes);

extern int sceUserServiceGetForegroundUser(int *userId);

extern int sceUserServiceGetInitialUser(int *userId);

typedef struct {

    unsigned int size;

    uint32_t userId;

} SceShellUIUtilLaunchByUriParam;

int ps5_launch_browser(const char *uri) {

  wkali_log("[STORE] Launching browser: %s\n", uri);

  if (sceSystemServiceLaunchWebBrowser(uri) != 0) {

    wkali_notify("Could not open browser");

    return -1;

  }

  return 0;

}

/* Same approach as ps5-unified-autoloader: navigate home via ShellUIUtil so

 * SceNKWebProcess closes without an OS error dialog. */

int ps5_return_to_home(void) {

  int (*p_init)(void) = NULL;

  int (*p_launch)(const char *uri, SceShellUIUtilLaunchByUriParam *param) = NULL;

  int mod = sceKernelLoadStartModule(

      "/system_ex/common_ex/lib/libSceShellUIUtil.sprx", 0, 0, 0, 0, 0);

  if (mod < 0) {

    wkali_log("[STORE] ShellUIUtil load failed: 0x%08x\n", mod);

    return -1;

  }

  p_init = (void *)kernel_dynlib_dlsym(-1, (uint32_t)mod, "sceShellUIUtilInitialize");

  p_launch = (void *)kernel_dynlib_dlsym(-1, (uint32_t)mod, "sceShellUIUtilLaunchByUri");

  if (!p_init || !p_launch) {

    wkali_log("[STORE] ShellUIUtil symbols missing\n");

    return -1;

  }

  SceShellUIUtilLaunchByUriParam param;

  memset(&param, 0, sizeof(param));

  param.size = sizeof(param);

  p_init();

  if (sceUserServiceGetForegroundUser((int *)&param.userId) != 0 ||

      param.userId == 0 || param.userId == (uint32_t)-1) {

    sceUserServiceGetInitialUser((int *)&param.userId);

  }

  wkali_log("[STORE] Returning to home (close browser), userId=0x%08x\n",

            param.userId);

  int res = p_launch("pshomeui:navigateToHome?bootCondition=psButton", &param);

  if (res != 0) {

    wkali_log("[STORE] navigateToHome failed: 0x%08x\n", res);

  }

  return res;

}

#ifdef STORE_BUILD

#include "reboot_elf.h"

#include "poweroff_elf.h"

#include "suspend_elf.h"

#include <sys/socket.h>

#include <netinet/in.h>

#include <arpa/inet.h>

#include <errno.h>

#include <fcntl.h>

#include <stdatomic.h>

#include <sys/stat.h>

/* Set by /exit; main() sends reboot.elf AFTER MHD stops so the process

 * is still alive (the old sleep(2) pthread raced main exit ~1.5s). */

static atomic_int g_want_reboot_elf = 0;

static int send_all_fd(int fd, const unsigned char *p, size_t n) {

  while (n > 0) {

    ssize_t w = send(fd, p, n, 0);

    if (w < 0) {

      if (errno == EINTR)

        continue;

      return -1;

    }

    if (w == 0)

      return -1;

    p += (size_t)w;

    n -= (size_t)w;

  }

  return 0;

}

static int connect_elfldr(uint32_t host_be) {

  int fd;

  struct sockaddr_in addr;

  int attempt;

  for (attempt = 0; attempt < 8; attempt++) {

    fd = socket(AF_INET, SOCK_STREAM, 0);

    if (fd < 0)

      return -1;

    memset(&addr, 0, sizeof(addr));

    addr.sin_family = AF_INET;

    addr.sin_port = htons(9021);

    addr.sin_addr.s_addr = host_be;

    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) == 0)

      return fd;

    wkali_log("[STORE] reboot connect attempt %d host=0x%08x failed: %d\n",

              attempt, (unsigned)ntohl(host_be), errno);

    close(fd);

    usleep(250000);

  }

  return -1;

}

static int write_reboot_to_disk(const char *path) {

  int fd;

  const unsigned char *p = g_reboot_elf;

  size_t n = g_reboot_elf_len;

  mkdir("/data/wkal", 0777);

  fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0755);

  if (fd < 0) {

    wkali_log("[STORE] write %s failed: %d\n", path, errno);

    return -1;

  }

  while (n > 0) {

    ssize_t w = write(fd, p, n);

    if (w < 0) {

      if (errno == EINTR)

        continue;

      close(fd);

      return -1;

    }

    if (w == 0) {

      close(fd);

      return -1;

    }

    p += (size_t)w;

    n -= (size_t)w;

  }

  fsync(fd);

  close(fd);

  return 0;

}

/* Prefer file:// URI (elf-launcher style) so elfldr keeps the real name;

 * fall back to raw ELF bytes. Always SHUT_WR so elfldr sees EOF. */

static int send_reboot_elf_to_elfldr(void) {

  static const char disk_path[] = "/data/wkal/reboot.elf";

  char uri[128];

  int fd;

  int rc;

  sync();

  if (write_reboot_to_disk(disk_path) == 0) {

    int n = snprintf(uri, sizeof(uri), "file://%s\n", disk_path);

    if (n > 0 && (size_t)n < sizeof(uri)) {

      fd = connect_elfldr(htonl(INADDR_LOOPBACK));

      if (fd >= 0) {

        wkali_log("[STORE] Sending file:// reboot.elf to elfldr :9021\n");

        rc = send_all_fd(fd, (const unsigned char *)uri, (size_t)n);

        shutdown(fd, SHUT_WR);

        usleep(500000);

        close(fd);

        if (rc == 0) {

          wkali_log("[STORE] file:// reboot.elf sent\n");

          return 0;

        }

        wkali_log("[STORE] file:// send failed, trying raw bytes\n");

      }

    }

  }

  fd = connect_elfldr(htonl(INADDR_LOOPBACK));

  if (fd < 0) {

    wkali_log("[STORE] reboot connect :9021 failed\n");

    return -1;

  }

  wkali_log("[STORE] Sending raw reboot.elf (%u bytes) to elfldr :9021\n",

            (unsigned)g_reboot_elf_len);

  rc = send_all_fd(fd, g_reboot_elf, g_reboot_elf_len);

  shutdown(fd, SHUT_WR);

  usleep(500000);

  close(fd);

  if (rc != 0) {

    wkali_log("[STORE] reboot.elf send failed: %d\n", errno);

    return -1;

  }

  wkali_log("[STORE] reboot.elf sent\n");

  return 0;

}

int ps5_reboot_console(void) {

  wkali_log("[STORE] Soft rebooting via reboot.elf -> :9021 (after MHD stop)\n");

  wkali_notify("Soft rebooting");

  atomic_store(&g_want_reboot_elf, 1);

  return 0;

}

int ps5_reboot_elf_pending(void) {

  return atomic_load(&g_want_reboot_elf) ? 1 : 0;

}

int ps5_reboot_elf_run(void) {

  int rc;

  if (!atomic_load(&g_want_reboot_elf))

    return 0;

  wkali_log("[STORE] Running deferred reboot.elf load\n");

  rc = send_reboot_elf_to_elfldr();

  if (rc != 0) {

    wkali_notify("Reboot ELF failed");

    return rc;

  }

  /* Stay alive until console actually reboots; do not return to exit main. */

  wkali_log("[STORE] reboot.elf handed to elfldr; waiting for reboot\n");

  for (;;)

    sleep(30);

  return 0;

}

static int send_named_elf_to_elfldr(const char *name, const unsigned char *blob, size_t len) {

  char disk_path[96];

  char uri[128];

  int fd;

  int rc;

  int n;

  if (!name || !blob || len == 0)

    return -1;

  /* Prefer install-time file in /data/wkal (file:// to elfldr). */
  snprintf(disk_path, sizeof(disk_path), "/data/wkal/%s", name);
  if (access(disk_path, R_OK) == 0) {
    n = snprintf(uri, sizeof(uri), "file://%s\n", disk_path);
    if (n > 0 && (size_t)n < sizeof(uri)) {
      fd = connect_elfldr(htonl(INADDR_LOOPBACK));
      if (fd >= 0) {
        wkali_log("[STORE] Sending installed file:// %s to elfldr :9021\n", name);
        rc = send_all_fd(fd, (const unsigned char *)uri, (size_t)n);
        shutdown(fd, SHUT_WR);
        usleep(300000);
        close(fd);
        if (rc == 0) {
          wkali_log("[STORE] installed file:// %s sent\n", name);
          return 0;
        }
      }
    }
  }

  /* Raw bytes next: same path Relapse uses, no disk race. */

  fd = connect_elfldr(htonl(INADDR_LOOPBACK));

  if (fd >= 0) {

    wkali_log("[STORE] Sending raw %s (%u bytes) to elfldr :9021\n", name, (unsigned)len);

    rc = send_all_fd(fd, blob, len);

    shutdown(fd, SHUT_WR);

    usleep(300000);

    close(fd);

    if (rc == 0) {

      wkali_log("[STORE] %s sent\n", name);

      return 0;

    }

    wkali_log("[STORE] raw %s send failed: %d, trying file://\n", name, errno);

  } else {

    wkali_log("[STORE] power connect :9021 failed for %s, trying file://\n", name);

  }

  sync();

  mkdir("/data/wkal", 0777);

  snprintf(disk_path, sizeof(disk_path), "/data/wkal/%s", name);

  {

    int wfd = open(disk_path, O_WRONLY | O_CREAT | O_TRUNC, 0755);

    const unsigned char *bp = blob;

    size_t left = len;

    if (wfd < 0) {

      wkali_log("[STORE] write %s failed: %d\n", disk_path, errno);

      return -1;

    }

    while (left > 0) {

      ssize_t w = write(wfd, bp, left);

      if (w < 0) {

        if (errno == EINTR) continue;

        close(wfd);

        return -1;

      }

      if (w == 0) { close(wfd); return -1; }

      bp += (size_t)w;

      left -= (size_t)w;

    }

    fsync(wfd);

    close(wfd);

  }

  n = snprintf(uri, sizeof(uri), "file://%s\n", disk_path);

  if (n <= 0 || (size_t)n >= sizeof(uri))

    return -1;

  fd = connect_elfldr(htonl(INADDR_LOOPBACK));

  if (fd < 0) {

    wkali_log("[STORE] power file:// connect :9021 failed for %s\n", name);

    return -1;

  }

  wkali_log("[STORE] Sending file:// %s to elfldr :9021\n", name);

  rc = send_all_fd(fd, (const unsigned char *)uri, (size_t)n);

  shutdown(fd, SHUT_WR);

  usleep(300000);

  close(fd);

  if (rc != 0) {

    wkali_log("[STORE] file:// %s send failed: %d\n", name, errno);

    return -1;

  }

  wkali_log("[STORE] file:// %s sent\n", name);

  return 0;

}


int ps5_seed_power_elfs(void) {
  struct { const char *name; const unsigned char *blob; unsigned len; } items[3];
  int i, ok = 0;
  items[0].name = "poweroff.elf"; items[0].blob = g_poweroff_elf; items[0].len = g_poweroff_elf_len;
  items[1].name = "reboot.elf";   items[1].blob = g_reboot_elf;   items[1].len = g_reboot_elf_len;
  items[2].name = "suspend.elf";  items[2].blob = g_suspend_elf;  items[2].len = g_suspend_elf_len;
  mkdir("/data/wkal", 0777);
  for (i = 0; i < 3; i++) {
    char path[96];
    int fd;
    const unsigned char *p;
    size_t n;
    snprintf(path, sizeof(path), "/data/wkal/%s", items[i].name);
    fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0755);
    if (fd < 0) {
      wkali_log("[STORE] seed %s failed: %d\n", path, errno);
      continue;
    }
    p = items[i].blob;
    n = items[i].len;
    while (n > 0) {
      ssize_t w = write(fd, p, n);
      if (w < 0) {
        if (errno == EINTR) continue;
        close(fd);
        wkali_log("[STORE] seed write %s failed: %d\n", path, errno);
        fd = -1;
        break;
      }
      if (w == 0) { close(fd); fd = -1; break; }
      p += (size_t)w;
      n -= (size_t)w;
    }
    if (fd >= 0) {
      fsync(fd);
      close(fd);
      wkali_log("[STORE] seeded %s (%u bytes)\n", path, items[i].len);
      ok++;
    }
  }
  return (ok == 3) ? 0 : -1;
}

int ps5_power_action(const char *action) {

  if (!action || !action[0])

    return -1;

  if (strcmp(action, "off") == 0 || strcmp(action, "poweroff") == 0) {

    wkali_notify("Power off.");

    return send_named_elf_to_elfldr("poweroff.elf", g_poweroff_elf, g_poweroff_elf_len);

  }

  if (strcmp(action, "reboot") == 0) {

    wkali_notify("Rebooting.");

    return send_named_elf_to_elfldr("reboot.elf", g_reboot_elf, g_reboot_elf_len);

  }

  if (strcmp(action, "rest") == 0 || strcmp(action, "suspend") == 0) {

    wkali_notify("Rest mode.");

    return send_named_elf_to_elfldr("suspend.elf", g_suspend_elf, g_suspend_elf_len);

  }

  return -1;

}

#else

int ps5_reboot_console(void) {

  wkali_log("[STORE] ps5_reboot_console: Store-only\n");

  return -1;

}

int ps5_reboot_elf_pending(void) { return 0; }

int ps5_reboot_elf_run(void) { return 0; }

int ps5_seed_power_elfs(void) { return -1; }

int ps5_power_action(const char *action) { (void)action; return -1; }

#endif

