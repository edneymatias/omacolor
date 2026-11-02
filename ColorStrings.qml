import QtQuick
import qs.Commons as Commons
import "ColorModel.js" as Model

// The only place that decides where the Color strings come from. Today they ship with the plugin
// (i18n/<code>.json); an upstream PR would switch t() to Commons.I18n.t and move the keys into
// default/i18n/en/shell.json.
QtObject {
  id: root

  property QtObject catalog: Commons.Translations {
    // A real path: Translations does not decode %20 in a file URL.
    directory: Model.fileUrlToPath(Qt.resolvedUrl("i18n"))
  }

  function t(key, fallback) {
    return root.catalog.t(key, fallback)
  }
}
