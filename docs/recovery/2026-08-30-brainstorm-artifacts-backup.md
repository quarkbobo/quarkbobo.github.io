# Brainstorm artifact backup — 2026-08-30

This recovery copy was created immediately before removing the local visual-companion artifacts under `.superpowers/brainstorm/` from the current Git tree.

- Backup path: `C:\Users\Lenovo\Desktop\Quarkbobo-backups\Quarkbobo-design-prototypes-before-untrack-20260830-174004`
- Source tracked file count: `11`
- Backup file count: `11`
- Verification: every source file matched its backup counterpart by relative path and SHA-256.

The backup preserves all currently tracked visual prototypes and companion runtime state, including `waiting-final-design.html`, while allowing the ignored local `.superpowers/` workspace to remain available without shipping with the website source.

## SHA-256 verification

| Repository-relative path | SHA-256 |
| --- | --- |
| `.superpowers/brainstorm/.last-port` | `3FF51078B2D71277EBBB90C02CAD5A1ADE655D1F2F9B4CCF900562F3D1B7CDF5` |
| `.superpowers/brainstorm/.last-token` | `19F9B182BEAE9D690EF1C88F24DD9DF6B25CD6DAC7163516D0E1610D8C98AA49` |
| `.superpowers/brainstorm/824-1787912745/content/planet-v2.html` | `DA9C279EEB14D73E6410FAB38DA9B017B39785E656ECFA49524E0183004FBFE9` |
| `.superpowers/brainstorm/824-1787912745/content/reference-flow-v4.html` | `84198EAA21697292D23CE519AF9F9539FBC48AED6C979CE10FF8FC326F5004E1` |
| `.superpowers/brainstorm/824-1787912745/content/reference-flow-v8-saturn.html` | `4F3100C65E77BABF4EEB9CF8370EC99E4BA7D3122D806DFB9D85DA83F5397BD1` |
| `.superpowers/brainstorm/824-1787912745/content/surface-effects-v3.html` | `EF18550D32105E99B5871DBF92E721B545AA3BD922DDD3C685D288CBCD916E95` |
| `.superpowers/brainstorm/824-1787912745/content/visual-style.html` | `7B0C5E7E4DBFFDDA793538C707AEAE8B53D6F518753D727E6070BCB432FA0613` |
| `.superpowers/brainstorm/824-1787912745/content/waiting-final-design.html` | `F427FC8FF9A36BE3AC289A680BA6DC2B1A5FA21C1268572C34FA1B04376B84D6` |
| `.superpowers/brainstorm/824-1787912745/state/server-info` | `084108B5A6046E926810D400BBCAEC333BC5A8BE1633328974B84CF92AF73EF3` |
| `.superpowers/brainstorm/824-1787912745/state/server-instance-id` | `975A8009F4137BD847FF1E8FFC72E0186A8F7A14911DBF12CAC21BDA36C1AEC5` |
| `.superpowers/brainstorm/824-1787912745/state/server.pid` | `C46D216D100C119FD05258F0799E1463869683FCF482D4BFF76911E907278F86` |

## Recovery procedure

1. Copy the backup's `.superpowers/brainstorm/` directory into the repository's `.superpowers/brainstorm/` directory, preserving relative paths.
2. Compare the restored files with the SHA-256 values above.
3. Leave the restored files ignored for local use. Only if they intentionally need to be tracked again, add the desired paths explicitly with Git's force-add option because `.superpowers/` is ignored.

Removing these paths from the current Git index does not delete the working-tree files and does not rewrite or prune earlier Git history. Earlier committed versions remain recoverable from the repository history.
