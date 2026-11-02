# Translating the Color section

The plugin ships `en.json` and `pt-BR.json`. Anyone can add a language.

1. Copy `en.json` to `<code>.json`. The code is one of the language codes Omarchy lists in
   `/usr/share/omarchy/default/i18n/locales.json` (for example `da`, `fr`, `pt-BR`).
2. Translate **only the values**. Keep every key as it is.
3. Keep the placeholders (`%1`, `%2`) exactly as in `en.json`. They are filled in by the plugin.
4. A language does not have to be complete: a missing key falls back to the base language
   (`pt-BR` to `pt`), then to English.
5. Run the check:

   ```bash
   python3 scripts/check_i18n.py
   ```

   It fails if the file name is not an Omarchy language code, if there are keys that are not in
   `en.json`, if a value is not text, or if the placeholders differ from the English text.
6. Open a pull request with the new file.

The language the plugin shows is the one chosen under Setup > Language in Omarchy; switching it
takes effect without a restart.
