# Redesign recovery point — 2026-08-28

This immutable recovery copy was created before the fluid-particle theme redesign.

- Backup path: `C:\Users\Lenovo\Desktop\Quarkbobo-backups\Quarkbobo-before-redesign-20260828-211820`
- Timestamp: `2026-08-28 21:18:20 +08:00`
- Robocopy exit code: `1` (successful copy with files copied)
- Source and backup file count: `23,559`
- Source and backup total bytes: `426,167,100`
- Copied desktop shortcuts: `BoBo一键更新.lnk`, `Posts.lnk`

## SHA-256 verification

| Path | SHA-256 |
| --- | --- |
| `_config.yml` | `4E4B94C1E5BBF3E7DD414440F68DD786470DC6A0B9DE5181F1011F3DCF1CF93C` |
| `package.json` | `FF7C1394C66318361C09BB5758256A5CF4E7F182873F3DBC589CEBD49744C94D` |
| `.git/HEAD` | `F6F2B945F6C411B02BA3DA9C7ACE88DCF71B6AF65BA2E0D89AA82900042B5A10` |

Each hash was identical between the source and this recovery copy.

## Recovery procedure

1. Stop Hexo and close terminals using the project.
2. Rename `C:/Users/Lenovo/Desktop/Quarkbobo` to `Quarkbobo-redesign-failed`.
3. Copy the recorded backup directory to `C:/Users/Lenovo/Desktop/Quarkbobo`.
4. Run `git status --short --branch` and `npm run build`.
