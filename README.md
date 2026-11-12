<img src="docs/img/banner.png" alt="WK Store">

Turns the PS5 Store tile into WK Store: open the tile, start the jailbreak, and Elf Launcher opens when it finishes.

## Quick start

1. Send [`WK_Store_V1.2.3.elf`](https://github.com/X-F1REBALL-X/wk-store/releases/latest/download/WK_Store_V1.2.3.elf) to elfldr on port `9021`.
2. Wait for the install to finish, then reboot.
3. Open the **Store** tile and press **Start Jailbreak**.

## Features

- Replaces the Store tile with WK Store.
- Relapse jailbreak from the tile, then Elf Launcher opens by itself.
- Works offline after install.
- Bundled Elf Launcher 2.1.6.
- A separate Restore ELF puts the original PlayStation Store tile back.

## Gallery

<p><img src="store/icon0.png" alt="Store tile icon" width="200"> <img src="store/pic0.png" alt="Store tile background" width="480"></p>

## Requirements

- PS5 firmware 7.00–13.60 (Relapse).
- elfldr listening on port `9021`.

## Installation

If an older WK Store is already installed, send Restore first, reboot, then install 1.2.3.

1. Send [`WK_Store_V1.2.3.elf`](https://github.com/X-F1REBALL-X/wk-store/releases/latest/download/WK_Store_V1.2.3.elf) to elfldr on port `9021`.
2. Wait until install finishes, then reboot.
3. Open the **Store** tile and press **Start Jailbreak**.

## Restore the PlayStation Store tile

Send [`WK_Store_Restore_V1.2.3.elf`](https://github.com/X-F1REBALL-X/wk-store/releases/latest/download/WK_Store_Restore_V1.2.3.elf) to elfldr on port `9021`, then reboot.

## Building from source

Needs the [PS5 payload SDK](https://github.com/ps5-payload-dev/sdk) with libmicrohttpd.

```bash
make store SDK=/path/to/ps5-payload-sdk
make restore SDK=/path/to/ps5-payload-sdk
```

Outputs `WK_Store_V1.2.3.elf` and `WK_Store_Restore_V1.2.3.elf`.

## License

[GNU GPL v3](LICENSE).

## Credits

- Relapse (PS5 WebKit / kernel chain)
- [ps5-elfldr](https://github.com/itsPLK/ps5-elfldr) by itsPLK
- [elf-launcher](https://github.com/X-F1REBALL-X/elf-launcher)
- SQLite (Store tile database remap)

Developed by X-F1REBALL-X.
