import QtQuick
import QtQuick.Controls
import Quickshell
import qs.Ui
import qs.Commons
import qs.Commons as Commons
import "ColorApply.js" as Shared
import "ColorModel.js" as Model

// Omacolor's bar widget and panel: the shown display at the top with a display picker on the right
// (as in the Omarchy 4.6 Display panel), and the Color section below. The stock Display panel is
// left alone.
Panel {
  id: root
  moduleName: "io.github.edneymatias.omacolor"
  ipcTarget: "io.github.edneymatias.omacolor"

  readonly property real panelCap: Style.space(560)

  // One ColorApplier for the whole shell: this widget exists once per bar, and appliers with
  // separate state would undo each other.
  property var colorApplier: null
  Component {
    id: applierComponent
    ColorApplier {}
  }
  Item {
    visible: false
    Component.onCompleted: root.colorApplier = Shared.acquireShared(function () {
      return applierComponent.createObject(null)
    })
    Component.onDestruction: {
      root.colorApplier = null
      Shared.releaseShared()
    }
  }

  ColorStrings { id: strings }

  // ---------- which display is shown ----------
  property string selectedName: ""
  readonly property var entries: Model.displayEntries(colorApplier ? colorApplier.monitorList : [])
  readonly property var current: Model.currentDisplay(entries, selectedName)
  readonly property var sections: entries.length > 1 ? ["displays", "color"] : ["color"]

  // ---------- keyboard cursor, shared with the pointer ----------
  property string focusSection: "color"
  property int selectedIndex: 0
  property bool cursorActive: false
  property int colorRowCount: 1
  property var colorActivate: null

  function move(delta) {
    var next = Model.navigate({ section: focusSection, index: selectedIndex }, delta,
                              { sections: sections, counts: { displays: entries.length, color: colorRowCount } })
    focusSection = next.section
    selectedIndex = next.index
  }

  function moveSideways(delta) {
    if (focusSection === "displays") selectedName = Model.stepDisplay(entries, current ? current.name : "", delta)
  }

  function activate() {
    if (focusSection === "color" && colorActivate) colorActivate(selectedIndex)
  }

  onColorRowCountChanged: if (selectedIndex > colorRowCount - 1) selectedIndex = Math.max(0, colorRowCount - 1)
  onSectionsChanged: if (sections.indexOf(focusSection) < 0) { focusSection = "color"; selectedIndex = 0 }

  // Each opening starts on the focused display, with the cursor hidden until a key is used.
  onOpenedChanged: {
    if (!opened) return
    selectedName = ""
    focusSection = "color"
    selectedIndex = 0
    cursorActive = false
    if (colorApplier) {
      colorApplier.refreshMonitors()
      colorApplier.refreshUserFiles()
    }
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰏘"
    onPressed: function(b) { root.toggle() }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: panel.loadedContent
    contentWidth: panel.fittedContentWidth(Style.space(380))
    contentHeight: panel.fittedContentHeight(panel.loadedContentHeight, root.panelCap)

    content: PanelKeyCatcher {
      implicitHeight: panelColumn.implicitHeight
      anchors.fill: parent
      onMoveRequested: function(dx, dy) {
        if (!root.cursorActive) { root.cursorActive = true; return }
        if (dy !== 0) root.move(dy)
        else if (dx !== 0) root.moveSideways(dx)
      }
      onActivateRequested: if (root.cursorActive) root.activate()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: panelColumn
        width: parent.width
        spacing: Style.space(14)

        // ---------- Hero: shown display · display picker ----------
        Item {
          width: parent.width
          implicitHeight: Math.max(heroIcon.implicitHeight, heroLabels.implicitHeight)

          Text {
            id: heroIcon
            textFormat: Text.PlainText
            text: Model.displayGlyph(root.current)
            color: root.bar.foreground
            font.family: root.bar.fontFamily
            font.pixelSize: Style.font.display
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
          }

          Column {
            id: heroLabels
            anchors.left: heroIcon.right
            anchors.leftMargin: Style.space(14)
            anchors.right: picker.visible ? picker.left : parent.right
            anchors.rightMargin: picker.visible ? Style.space(12) : 0
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            Text {
              textFormat: Text.PlainText
              text: Model.displayTitle(root.current, strings.t("item.builtinDisplay"))
              color: root.bar.foreground
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
              elide: Text.ElideRight
              width: parent.width
            }

            Text {
              textFormat: Text.PlainText
              text: root.current ? root.current.name.toUpperCase() : ""
              color: Qt.darker(root.bar.foreground, 1.4)
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1.2
              elide: Text.ElideRight
              width: parent.width
            }
          }

          // One icon per display, named in its tooltip: the shown one in the accent, the rest dim
          // until hovered or picked. Only when there is more than one display.
          Row {
            id: picker
            visible: root.entries.length > 1
            spacing: Style.space(14)
            anchors.right: parent.right
            anchors.rightMargin: Style.space(6)
            anchors.verticalCenter: parent.verticalCenter

            Repeater {
              model: root.entries

              Text {
                id: pick
                required property var modelData
                required property int index

                readonly property bool isCurrent: root.current !== null && root.current.name === modelData.name
                readonly property bool picked: root.cursorActive && root.focusSection === "displays" && isCurrent
                readonly property bool hot: pickMouse.containsMouse || picked

                text: Model.displayGlyph(modelData)
                textFormat: Text.PlainText
                color: isCurrent ? Commons.Color.accent : (hot ? root.bar.foreground : Qt.darker(root.bar.foreground, 1.55))
                font.family: root.bar.fontFamily
                font.pixelSize: Style.font.icon

                MouseArea {
                  id: pickMouse
                  anchors.fill: parent
                  anchors.margins: -Style.space(6)
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.selectedName = pick.modelData.name
                }

                PanelToolTip {
                  visible: pickMouse.containsMouse
                  text: Model.displayTitle(pick.modelData, strings.t("item.builtinDisplay")) + " · " + pick.modelData.name
                }
              }
            }
          }
        }

        PanelSeparator {
          foreground: root.bar.foreground
        }

        ColorSection {
          width: parent.width
          applier: root.colorApplier
          monitorName: root.current ? root.current.name : ""
          bar: root.bar
          cursorActive: root.cursorActive && root.focusSection === "color"
          selectedIndex: root.selectedIndex
          panelMaxHeight: Math.min(root.panelCap, panel.availableCardHeight > 0 ? panel.availableCardHeight : root.panelCap)
            - panel.verticalContentInset
          reservedBelow: 0
          onRowCountChanged: root.colorRowCount = rowCount
          onRowHovered: function (index) {
            root.cursorActive = true
            root.focusSection = "color"
            root.selectedIndex = index
          }
          Component.onCompleted: { root.colorRowCount = rowCount; root.colorActivate = activateRow }
          Component.onDestruction: root.colorActivate = null
        }
      }
    }
  }
}
