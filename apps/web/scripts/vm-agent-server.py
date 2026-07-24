#!/usr/bin/env python3
"""
VM Agent Server - Runs on Paperspace VM to handle computer use actions
Provides HTTP API for screenshots, mouse, keyboard actions
"""

import subprocess
import base64
import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler

# Start virtual display if not already running
DISPLAY = os.environ.get('DISPLAY', ':99')
os.environ['DISPLAY'] = DISPLAY

class AgentHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/computer':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            action = json.loads(post_data.decode('utf-8'))
            
            result = self.handle_action(action)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
    
    def handle_action(self, action):
        action_type = action.get('action')
        
        try:
            if action_type == 'screenshot':
                return self.take_screenshot()
            elif action_type == 'mouse_move':
                return self.mouse_move(action.get('coordinate', [0, 0]))
            elif action_type == 'left_click':
                return self.click('left')
            elif action_type == 'right_click':
                return self.click('right')
            elif action_type == 'middle_click':
                return self.click('middle')
            elif action_type == 'double_click':
                return self.double_click()
            elif action_type == 'type':
                return self.type_text(action.get('text', ''))
            elif action_type == 'key':
                return self.press_key(action.get('key', ''))
            elif action_type == 'scroll':
                return self.scroll(action.get('coordinate', [0, 0]), action.get('direction', 'down'))
            else:
                return {'error': f'Unknown action: {action_type}'}
        except Exception as e:
            return {'error': str(e)}
    
    def take_screenshot(self):
        """Take a screenshot and return as base64"""
        screenshot_path = '/tmp/screenshot.png'
        subprocess.run(['scrot', '-o', screenshot_path], check=True)
        
        with open(screenshot_path, 'rb') as f:
            screenshot_data = base64.b64encode(f.read()).decode('utf-8')
        
        return {'screenshot': screenshot_data}
    
    def mouse_move(self, coordinate):
        """Move mouse to coordinate"""
        x, y = coordinate
        subprocess.run(['xdotool', 'mousemove', str(x), str(y)], check=True)
        return {'message': f'Moved mouse to ({x}, {y})'}
    
    def click(self, button):
        """Click mouse button"""
        button_map = {'left': '1', 'middle': '2', 'right': '3'}
        subprocess.run(['xdotool', 'click', button_map.get(button, '1')], check=True)
        return {'message': f'{button} click performed'}
    
    def double_click(self):
        """Double click"""
        subprocess.run(['xdotool', 'click', '--repeat', '2', '1'], check=True)
        return {'message': 'Double click performed'}
    
    def type_text(self, text):
        """Type text"""
        subprocess.run(['xdotool', 'type', '--', text], check=True)
        return {'message': f'Typed text'}
    
    def press_key(self, key):
        """Press a key or key combination"""
        subprocess.run(['xdotool', 'key', key], check=True)
        return {'message': f'Pressed key: {key}'}
    
    def scroll(self, coordinate, direction):
        """Scroll at coordinate"""
        x, y = coordinate
        subprocess.run(['xdotool', 'mousemove', str(x), str(y)], check=True)
        button = '4' if direction == 'up' else '5'
        subprocess.run(['xdotool', 'click', '--repeat', '3', button], check=True)
        return {'message': f'Scrolled {direction}'}
    
    def log_message(self, format, *args):
        print(f"[AgentServer] {args[0]}")

def main():
    # Ensure Xvfb is running
    try:
        subprocess.run(['pgrep', '-x', 'Xvfb'], check=True, capture_output=True)
        print(f"[AgentServer] Xvfb already running on {DISPLAY}")
    except subprocess.CalledProcessError:
        print(f"[AgentServer] Starting Xvfb on {DISPLAY}")
        subprocess.Popen(['Xvfb', DISPLAY, '-screen', '0', '1920x1080x24'])
        import time
        time.sleep(2)
    
    server = HTTPServer(('0.0.0.0', 8080), AgentHandler)
    print(f"[AgentServer] Running on port 8080 (DISPLAY={DISPLAY})")
    server.serve_forever()

if __name__ == '__main__':
    main()
