# Changelog

## 0.1.0

First release.

- A bar widget whose panel picks an ICC colour profile per display, with a display picker
  (laptop or monitor icon) at the top right. It sits next to the stock Display widget.
- Profiles: one made from the display's own EDID, sRGB, Display P3, Adobe RGB, Rec.709,
  Rec.2020, and your own `.icc` files in `~/.local/share/icc`.
- The choice is remembered per monitor model and applied again after a config reload,
  a replug or a suspend.
- A broken `.icc` file is refused with a message before anything is applied.
- `omarchy plugin remove` deletes everything the plugin created; your own profiles are
  never touched.
- English and Brazilian Portuguese.

Requires Omarchy 4.5 with Hyprland 0.56, `python3` and `xdg-utils` (`lcms2` optional).
Tested on near-sRGB displays only; not yet tested on a wide-gamut display or on Omarchy 4.6.
