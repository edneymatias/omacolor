import QtQuick
import QtQuick.Controls
import Quickshell
import qs.Ui
import qs.Commons
import qs.Commons as Commons
import "ColorModel.js" as Model

// The Color section of the Display panel: the applied profile on top, the available ones below,
// "Manage profiles…" last. List content comes from ColorModel.js; changes go through the applier.
Column {
  id: root
  spacing: Style.space(10)

  property var applier: null
  property string monitorName: ""
  property var bar
  property bool cursorActive: false
  property int selectedIndex: 0
  property var ensureOuterVisible: null
  property string rejectedMessage: ""
  // Total height the panel allows; the list takes what is left below the sections above it.
  property real panelMaxHeight: 0
  // Height that follows this section in the panel column (spacing and the stock end item).
  property real reservedBelow: 0
  // True while a hover is moving the cursor: then the row is highlighted but nothing scrolls.
  property bool pointerMoving: false

  signal rowHovered(int index)
  signal chosen(string id)
  signal manageRequested()

  readonly property var items: applier ? (applier.itemsByMonitor[monitorName] || []) : []
  readonly property string appliedId: applier ? applier.appliedIdFor(monitorName) : ""
  readonly property var panelPrimaries: {
    for (var i = 0; i < items.length; i++) if (items[i].kind === "edid") return items[i].primaries
    return null
  }
  readonly property var list: Model.buildList(items, appliedId, panelPrimaries)
  readonly property string identity: applier ? applier.identityFor(monitorName) : "unknown"
  readonly property var rows: Model.sectionRows(identity, list)
  readonly property int rowCount: rows.length
  readonly property bool anyWarn: {
    for (var i = 0; i < list.available.length; i++) if (list.available[i].warn) return true
    return false
  }

  readonly property real aboveListHeight: headerRow.implicitHeight + spacing
  readonly property real belowListHeight: manageRow.implicitHeight + spacing
    + (warnNote.visible ? warnNote.implicitHeight + spacing : 0)
    + (rejectedNote.visible ? rejectedNote.implicitHeight + spacing : 0)
  readonly property real listHeight: panelMaxHeight > 0
    ? Model.listViewportHeight(Model.listAvailable(panelMaxHeight, y, aboveListHeight, belowListHeight, reservedBelow),
                               Style.space(90), listColumn.implicitHeight)
    : Math.min(listColumn.implicitHeight, Style.space(210))

  visible: monitorName !== ""



  ColorStrings { id: strings }

  function labelOf(item) {
    if (item.kind === "edid") {
      var display = item.builtin ? strings.t("item.builtinDisplay") : item.edidName
      return strings.t("item.edid").replace("%1", function () { return display })
    }
    return item.labelKey ? strings.t(item.labelKey) : item.label
  }

  function hoverRow(index) {
    root.pointerMoving = true
    root.rowHovered(index)
    Qt.callLater(function () { root.pointerMoving = false })
  }

  function activateRow(index) {
    var row = rows[index]
    if (!row || !applier) return
    if (row.kind === "manage") {
      root.manageRequested()
      applier.openUserDir()
      return
    }
    var outcome = Model.clickOutcome(appliedId, row.id)
    applier.chooseFor(monitorName, outcome.action === "remove" ? "" : outcome.id)
    root.chosen(row.id)
  }

  // Keeps the cursor row inside the fixed-height list.
  function ensureInnerVisible(item) {
    var top = item.mapToItem(listColumn, 0, 0).y
    var bottom = top + item.height
    if (top < flick.contentY) flick.contentY = top
    else if (bottom > flick.contentY + flick.height) flick.contentY = bottom - flick.height
  }

  onMonitorNameChanged: rejectedMessage = ""

  Connections {
    target: root.applier
    function onRejected(monitorName, id, reason, kind) {
      if (monitorName !== root.monitorName) return
      var label = id
      for (var i = 0; i < root.items.length; i++) if (root.items[i].id === id) label = root.labelOf(root.items[i])
      var template = strings.t(kind === "failed" ? "warn.applyFailed" : "warn.invalidProfile")
      // Function replacements: a file name with "$&" must not be read as a pattern.
      root.rejectedMessage = template.replace("%1", function () { return label })
                                     .replace("%2", function () { return reason })
    }
    function onApplied(monitorName, id) {
      if (monitorName === root.monitorName) root.rejectedMessage = ""
    }
  }

  // ---------- header ----------
  Item {
    id: headerRow
    width: parent.width
    implicitHeight: header.implicitHeight

    PanelSectionHeader {
      id: header
      text: strings.t("section.title")
      foreground: root.bar.foreground
      fontFamily: root.bar.fontFamily
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
    }

    Text {
      textFormat: Text.PlainText
      text: Model.titleLabel(root.monitorName, root.list.applied ? root.labelOf(root.list.applied) : "", strings.t("value.none"))
      color: Qt.darker(root.bar.foreground, 1.4)
      font.family: root.bar.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
      elide: Text.ElideRight
      width: Math.min(implicitWidth, parent.width - header.implicitWidth - Style.space(12))
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
    }
  }

  // A display without make or model cannot keep a choice: say so instead of a list that does nothing.
  Text {
    visible: root.identity === "unidentified"
    width: parent.width
    wrapMode: Text.WordWrap
    textFormat: Text.PlainText
    text: strings.t("warn.unidentified")
    color: Qt.darker(root.bar.foreground, 1.5)
    font.family: root.bar.fontFamily
    font.pixelSize: Style.font.caption
  }

  // ---------- list (fixed height, scrolls inside) ----------
  Item {
    id: viewport
    visible: root.identity !== "unidentified"
    width: parent.width
    height: root.listHeight

    Flickable {
      id: flick
      anchors.fill: parent
      contentWidth: width
      contentHeight: listColumn.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      ScrollBar.vertical: ScrollBar {
        policy: flick.contentHeight > flick.height ? ScrollBar.AsNeeded : ScrollBar.AlwaysOff
        width: Style.space(4)
      }

      Column {
        id: listColumn
        width: flick.width - Style.space(8)
        spacing: Style.space(2)

        Text {
          visible: root.list.applied !== null
          textFormat: Text.PlainText
          text: strings.t("group.applied")
          color: Qt.darker(root.bar.foreground, 1.7)
          font.family: root.bar.fontFamily
          font.pixelSize: Style.font.caption
        }

        Loader {
          width: parent.width
          active: root.list.applied !== null
          visible: active
          sourceComponent: ColorRow { item: root.list.applied; rowIndex: 0 }
        }

        Text {
          visible: root.list.available.length > 0
          textFormat: Text.PlainText
          text: strings.t("group.available")
          color: Qt.darker(root.bar.foreground, 1.7)
          font.family: root.bar.fontFamily
          font.pixelSize: Style.font.caption
          topPadding: root.list.applied !== null ? Style.space(6) : 0
        }

        Repeater {
          model: root.list.available

          ColorRow {
            required property var modelData
            required property int index
            width: listColumn.width
            item: modelData
            rowIndex: index + (root.list.applied !== null ? 1 : 0)
          }
        }
      }
    }
  }

  Row {
    id: warnNote
    visible: root.anyWarn && root.identity !== "unidentified"
    width: parent.width
    spacing: Style.space(6)

    WarnMark { tone: Qt.darker(root.bar.foreground, 1.5) }

    Text {
      width: parent.width - Style.space(19)
      wrapMode: Text.WordWrap
      textFormat: Text.PlainText
      text: strings.t("warn.wider")
      color: Qt.darker(root.bar.foreground, 1.5)
      font.family: root.bar.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  Row {
    id: rejectedNote
    visible: root.rejectedMessage !== ""
    width: parent.width
    spacing: Style.space(6)

    WarnMark { tone: Commons.Color.urgent }

    Text {
      width: parent.width - Style.space(19)
      wrapMode: Text.WordWrap
      textFormat: Text.PlainText
      text: root.rejectedMessage
      color: Commons.Color.urgent
      font.family: root.bar.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  // ---------- manage ----------
  CursorSurface {
    id: manageRow
    width: parent.width
    readonly property int rowIndex: root.rowCount - 1
    hasCursor: root.cursorActive && root.selectedIndex === rowIndex
    onHasCursorChanged: if (hasCursor && root.ensureOuterVisible
                            && Model.scrollToCursor(root.pointerMoving ? "pointer" : "keyboard")) root.ensureOuterVisible(manageRow)
    foreground: root.bar.foreground
    fill: Style.hoverFillFor(root.bar.foreground, Commons.Color.accent)
    implicitHeight: manageText.implicitHeight + Style.spacing.xl

    Text {
      id: manageText
      anchors.left: parent.left
      anchors.leftMargin: Style.space(6)
      anchors.verticalCenter: parent.verticalCenter
      textFormat: Text.PlainText
      text: strings.t("action.manage")
      color: Commons.Color.accent
      font.family: root.bar.fontFamily
      font.pixelSize: Style.font.body
    }

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onContainsMouseChanged: if (containsMouse) root.hoverRow(manageRow.rowIndex)
      onClicked: root.activateRow(manageRow.rowIndex)
    }
  }

  // A drawn warning mark: a circle with a bar and a dot. Only shapes, so no font can stretch it
  // or push the "!" off centre. The same mark sits on the row and in front of the explanation.
  component WarnMark: Rectangle {
    id: mark
    property color tone: root.bar.foreground
    readonly property real stroke: Math.max(1.5, Math.round(height * 0.14))
    width: Style.space(14)
    height: Style.space(14)
    radius: width / 2
    color: "transparent"
    border.width: 1
    border.color: tone

    Rectangle {
      width: mark.stroke
      height: Math.round(mark.height * 0.36)
      radius: width / 2
      color: mark.tone
      anchors.horizontalCenter: parent.horizontalCenter
      y: Math.round(mark.height * 0.2)
    }

    Rectangle {
      width: mark.stroke
      height: mark.stroke
      radius: width / 2
      color: mark.tone
      anchors.horizontalCenter: parent.horizontalCenter
      y: Math.round(mark.height * 0.66)
    }
  }

  component ColorRow: CursorSurface {
    id: colorRow
    required property var item
    required property int rowIndex

    readonly property bool isApplied: root.appliedId !== "" && item.id === root.appliedId

    hasCursor: root.cursorActive && root.selectedIndex === rowIndex
    onHasCursorChanged: if (hasCursor && Model.scrollToCursor(root.pointerMoving ? "pointer" : "keyboard")) {
      root.ensureInnerVisible(colorRow)
      if (root.ensureOuterVisible) root.ensureOuterVisible(colorRow)
    }
    current: isApplied
    foreground: root.bar.foreground
    fill: Style.hoverFillFor(root.bar.foreground, Commons.Color.accent)
    currentFill: Style.selectedFillFor(root.bar.foreground, Commons.Color.accent)
    implicitHeight: rowInner.implicitHeight + Style.spacing.xl

    Row {
      id: rowInner
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(6)
      anchors.rightMargin: Style.space(6)
      spacing: Style.space(8)

      Text {
        text: "󰏘"
        color: root.bar.foreground
        font.family: root.bar.fontFamily
        font.pixelSize: Style.font.title
        width: Style.space(22)
        horizontalAlignment: Text.AlignHCenter
        anchors.verticalCenter: parent.verticalCenter
      }

      Text {
        textFormat: Text.PlainText
        text: root.labelOf(colorRow.item)
        color: root.bar.foreground
        font.family: root.bar.fontFamily
        font.pixelSize: Style.font.body
        elide: Text.ElideRight
        width: parent.width - Style.space(22) - Style.space(14) - Style.space(16)
        anchors.verticalCenter: parent.verticalCenter
      }

      Item {
        width: Style.space(14)
        height: Style.space(14)
        anchors.verticalCenter: parent.verticalCenter

        Text {
          anchors.fill: parent
          visible: colorRow.isApplied
          textFormat: Text.PlainText
          text: "󰄬"
          color: root.bar.foreground
          font.family: root.bar.fontFamily
          font.pixelSize: Style.font.subtitle
          horizontalAlignment: Text.AlignRight
          verticalAlignment: Text.AlignVCenter
        }

        WarnMark {
          anchors.centerIn: parent
          visible: !colorRow.isApplied && colorRow.item.warn
          tone: root.bar.foreground
        }
      }
    }

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onContainsMouseChanged: if (containsMouse) root.hoverRow(colorRow.rowIndex)
      onClicked: root.activateRow(colorRow.rowIndex)
    }
  }
}
