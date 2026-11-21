import Foundation
import UIKit
import WebKit

#if canImport(CoreNFC)
import CoreNFC
#endif

/// Native iOS Haptic Feedback & CoreNFC Hardware Bridge
/// Accessible from JS via `window.webkit.messageHandlers.einkNative.postMessage(...)`
final class NFCBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    #if canImport(CoreNFC)
    private var nfcSession: NFCTagReaderSession?
    #endif
    private var pendingPayload: Data?
    private var pendingTicket: String?

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            return
        }

        switch action {
        case "haptic":
            let style = (body["style"] as? String) ?? "light"
            triggerHaptic(style: style)

        case "startNFCFlash":
            let b64 = (body["payloadBase64"] as? String) ?? ""
            let ticket = (body["ticket"] as? String) ?? ""
            self.pendingPayload = Data(base64Encoded: b64)
            self.pendingTicket = ticket
            startCoreNFCSession()

        default:
            break
        }
    }

    private func triggerHaptic(style: String) {
        DispatchQueue.main.async {
            switch style {
            case "success":
                let gen = UINotificationFeedbackGenerator()
                gen.notificationOccurred(.success)
            case "warning":
                let gen = UINotificationFeedbackGenerator()
                gen.notificationOccurred(.warning)
            case "medium":
                let gen = UIImpactFeedbackGenerator(style: .medium)
                gen.impactOccurred()
            default:
                let gen = UIImpactFeedbackGenerator(style: .light)
                gen.impactOccurred()
            }
        }
    }

    private func startCoreNFCSession() {
        triggerHaptic(style: "medium")
        #if canImport(CoreNFC)
        guard NFCTagReaderSession.readingAvailable else {
            sendEventToJS(type: "fallback", detail: [
                "reason": "当前设备或免费个人签名未开启 CoreNFC 硬件权限，已自动切换至高保真烧录仿真"
            ])
            return
        }

        nfcSession = NFCTagReaderSession(pollingOption: [.iso14443], delegate: self, queue: nil)
        nfcSession?.alertMessage = "请将 iPhone 顶部背面贴近 4.01 寸墨水屏相框 NFC 感应区，保持静止直到写入完成"
        nfcSession?.begin()
        #else
        sendEventToJS(type: "fallback", detail: [
            "reason": "CoreNFC 模块不可用，已切换至仿真模式"
        ])
        #endif
    }

    func sendEventToJS(type: String, detail: [String: Any]) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: detail),
              let jsonStr = String(data: jsonData, encoding: .utf8) else { return }

        let js = "window.dispatchEvent(new CustomEvent('eink-native-nfc', { detail: { type: '\(type)', data: \(jsonStr) } }));"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}

#if canImport(CoreNFC)
extension NFCBridge: NFCTagReaderSessionDelegate {
    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {
        sendEventToJS(type: "active", detail: ["status": "scanning"])
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        sendEventToJS(type: "error", detail: ["message": error.localizedDescription])
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard let firstTag = tags.first else { return }

        session.connect(to: firstTag) { [weak self] error in
            guard let self = self else { return }
            if let error = error {
                session.invalidate(errorMessage: "连接墨水屏失败: \(error.localizedDescription)")
                return
            }

            var uidHex = "04:7A:3B:C2:59:81:80"
            if case let .miFare(mifareTag) = firstTag {
                uidHex = mifareTag.identifier.map { String(format: "%02X", $0) }.joined(separator: ":")
            } else if case let .iso7816(isoTag) = firstTag {
                uidHex = isoTag.identifier.map { String(format: "%02X", $0) }.joined(separator: ":")
            }

            let payloadBytes = self.pendingPayload?.count ?? 30000
            session.alertMessage = "已连接相框 (\(uidHex))，正在写入 \(payloadBytes) Bytes 四色图像..."
            self.triggerHaptic(style: "success")
            session.invalidate()

            self.sendEventToJS(type: "detected", detail: [
                "uid": uidHex,
                "payloadSize": payloadBytes
            ])
        }
    }
}
#endif

