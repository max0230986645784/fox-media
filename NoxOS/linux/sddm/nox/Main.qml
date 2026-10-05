import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import SddmComponents 2.0

Rectangle {
    id: root
    width: 1920; height: 1080
    color: "#07080c"

    property bool unlocked: false
    property string message: ""

    Image {
        anchors.fill: parent
        source: config.background
        fillMode: Image.PreserveAspectCrop
    }
    Rectangle { anchors.fill: parent; color: "#000000"; opacity: unlocked ? 0.60 : 0.28
        Behavior on opacity { NumberAnimation { duration: 300 } } }

    // ---- ecran de verrouillage : heure + date ----
    Column {
        id: lock
        anchors.horizontalCenter: parent.horizontalCenter
        y: unlocked ? parent.height * 0.08 : parent.height * 0.22
        opacity: unlocked ? 0 : 1
        spacing: 6
        Behavior on y { NumberAnimation { duration: 350; easing.type: Easing.OutCubic } }
        Behavior on opacity { NumberAnimation { duration: 250 } }
        Text {
            id: clock
            anchors.horizontalCenter: parent.horizontalCenter
            color: "white"; font.pixelSize: 140; font.weight: Font.Light
            style: Text.Raised; styleColor: "#80000000"
        }
        Text {
            id: date
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#e6ffffff"; font.pixelSize: 30
        }
    }
    Timer {
        interval: 1000; running: true; repeat: true; triggeredOnStart: true
        onTriggered: {
            var d = new Date()
            clock.text = Qt.formatTime(d, "HH:mm")
            date.text = Qt.formatDate(d, "dddd d MMMM yyyy")
        }
    }
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom; anchors.bottomMargin: 70
        text: textConstants.promptSelectUser !== "" ? "Appuyez sur une touche ou cliquez pour vous connecter" : ""
        color: "#b0ffffff"; font.pixelSize: 18
        opacity: unlocked ? 0 : 1
        Behavior on opacity { NumberAnimation { duration: 250 } }
    }

    // ---- ecran de connexion : avatar logo + code ----
    Column {
        id: login
        anchors.horizontalCenter: parent.horizontalCenter
        y: parent.height * 0.30
        spacing: 22
        opacity: unlocked ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 300 } }

        Rectangle {
            width: 172; height: 172; radius: 86
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#1c1e26"; border.color: "#33ffffff"; border.width: 4
            Image { anchors.centerIn: parent; width: 120; height: 120; source: "logo.png"; smooth: true }
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: userModel.lastUser !== "" ? userModel.lastUser : "Nox"
            color: "white"; font.pixelSize: 30; font.weight: Font.Medium
        }
        Rectangle {
            width: 380; height: 48; radius: 10
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#2affffff"; border.color: pin.activeFocus ? "#8fa8ff" : "#55ffffff"; border.width: 1
            TextField {
                id: pin
                anchors.fill: parent; anchors.margins: 4
                echoMode: TextInput.Password
                passwordCharacter: "\u2022"
                placeholderText: "Entrez votre code Nox"
                color: "white"; font.pixelSize: 20
                horizontalAlignment: TextInput.AlignHCenter
                background: Item {}
                onAccepted: sddm.login(userModel.lastUser !== "" ? userModel.lastUser : "nox", text, sessionModel.lastIndex)
            }
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.message !== "" ? root.message : "Entree pour valider"
            color: root.message !== "" ? "#ff8a80" : "#99ffffff"; font.pixelSize: 15
        }
    }

    // ---- bas : session / arreter / redemarrer ----
    Row {
        anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.margins: 28
        spacing: 16
        opacity: unlocked ? 1 : 0
        Button { text: "Redemarrer"; flat: true; onClicked: sddm.reboot() }
        Button { text: "Arreter"; flat: true; onClicked: sddm.powerOff() }
    }

    Connections {
        target: sddm
        function onLoginFailed() { root.message = "Code incorrect. Reessayez."; pin.text = ""; pin.forceActiveFocus() }
        function onLoginSucceeded() { root.message = "" }
    }

    MouseArea {
        anchors.fill: parent; z: unlocked ? -1 : 1
        onClicked: root.unlock()
    }
    Keys.onPressed: function(ev) {
        if (!unlocked) { root.unlock(); ev.accepted = true }
        else if (ev.key === Qt.Key_Escape) { unlocked = false; pin.text = ""; root.message = "" }
    }
    function unlock() { unlocked = true; pin.forceActiveFocus() }
    Component.onCompleted: root.forceActiveFocus()
}
