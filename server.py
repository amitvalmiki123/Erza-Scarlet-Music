import http.server
import socketserver

PORT = 8080

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain")
        self.end_headers()
        self.wfile.write(b"Erza Music Bot is Alive and Running 24/7!")

with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
    print("Serving on port", PORT)
    httpd.serve_forever()