import Foundation
import WebKit

/// Custom URL Scheme Handler (`eink://app/...`)
/// Serves the bundled `frontend/` directory with full ES Module, 3D LUT `.cube`, and CORS support.
final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {
    private let frontendRoot: URL

    override init() {
        if let bundleFrontend = Bundle.main.url(forResource: "frontend", withExtension: nil) {
            self.frontendRoot = bundleFrontend
        } else {
            self.frontendRoot = Bundle.main.bundleURL
        }
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        var relativePath = requestURL.path
        if relativePath.hasPrefix("/") {
            relativePath.removeFirst()
        }
        if relativePath.isEmpty {
            relativePath = "index.html"
        }

        let fileURL = frontendRoot.appendingPathComponent(relativePath)

        guard FileManager.default.fileExists(atPath: fileURL.path),
              let data = try? Data(contentsOf: fileURL) else {
            let notFoundResponse = HTTPURLResponse(
                url: requestURL,
                statusCode: 404,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "text/plain; charset=utf-8"]
            )!
            urlSchemeTask.didReceive(notFoundResponse)
            urlSchemeTask.didReceive(Data("Not Found: \(relativePath)".utf8))
            urlSchemeTask.didFinish()
            return
        }

        let mimeType = Self.mimeType(for: fileURL.pathExtension)
        let headers: [String: String] = [
            "Content-Type": mimeType,
            "Content-Length": "\(data.count)",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
        ]

        if let response = HTTPURLResponse(
            url: requestURL,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        ) {
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // No-op for synchronous local bundle reads
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm":
            return "text/html; charset=utf-8"
        case "css":
            return "text/css; charset=utf-8"
        case "js", "mjs":
            return "application/javascript; charset=utf-8"
        case "json", "webmanifest":
            return "application/json; charset=utf-8"
        case "cube":
            return "text/plain; charset=utf-8"
        case "png":
            return "image/png"
        case "jpg", "jpeg":
            return "image/jpeg"
        case "svg":
            return "image/svg+xml"
        case "ico":
            return "image/x-icon"
        default:
            return "application/octet-stream"
        }
    }
}
