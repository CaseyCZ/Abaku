# Archivní návrh: Firebase – nepoužívá se

Tento dokument původně popisoval složitější Firebase variantu. **Aktuální řešení Abaku Online Firebase nepotřebuje.**

Platná implementace využívá:
- přihlášení Google Identity Services přímo na statickém webu,
- ověřování Google ID tokenu oficiálním `google-auth-library` na Oracle,
- SQLite pro minimální statistiky a přátele,
- WebSockety a zápasy uložené pouze v RAM.

**Aktuální postup a technické požadavky**: [server/README.md](../server/README.md).

Záloha offline hry 0.1.4 je v `backup/v0.1.4-stable-2026-10-22`.
