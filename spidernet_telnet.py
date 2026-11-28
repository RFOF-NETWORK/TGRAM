import os
import socket
import threading

HOST = os.environ.get("SPIDERNET_HOST", "127.0.0.1")
PORT = int(os.environ.get("SPIDERNET_PORT", "2323"))


def handle_client(conn: socket.socket) -> None:
    with conn:
        conn.sendall(b"=== InterBOxSpiderWeb Spidernet Node ===\r\nCommands: status, exit\r\n")
        while True:
            try:
                data = conn.recv(1024)
            except OSError:
                break
            if not data:
                break
            command = data.decode("utf-8", errors="ignore").strip()
            if command == "exit":
                break
            if command == "status":
                conn.sendall(b"[OK] Spidernet node active. 3 clouds registered.\r\n")
            else:
                conn.sendall(f"[Parser] Received: {command[:200]}\r\n".encode())


def start_telnet_server() -> None:
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((HOST, PORT))
    server.listen(5)
    print(f"[*] Spidernet node listening on {HOST}:{PORT}")
    while True:
        conn, _ = server.accept()
        threading.Thread(target=handle_client, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    start_telnet_server()
