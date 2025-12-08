#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CS2 DEMO 代理下载客户端
作者: 鼠子 YuiNijika
API: https://cs2demo.yuinijika.com/
"""

import tkinter as tk
from tkinter import messagebox, filedialog, ttk
import requests
import threading
import re
import os
from urllib.parse import urlparse
import time

PROXY_BASE_URL = "https://cs2demo.yuinijika.com"

# 请求头，模拟浏览器请求以绕过Cloudflare
REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
}

class CS2DemoDownloader:
    def __init__(self, root):
        self.root = root
        self.root.title("CS2 DEMO 代理下载器")
        self.root.geometry("700x500")
        self.root.resizable(True, True)
        
        self.session = requests.Session()
        self.session.headers.update(REQUEST_HEADERS)
        
        self.latency = None
        self.api_available = False
        
        self.supported_servers = []
        self.api_info = {}
        self.copyright_shown = False
        
        self.create_widgets()
        
        self.check_api_latency()

        self.wait_for_api_and_show_copyright()
    
    def create_widgets(self):
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        
        status_frame = ttk.LabelFrame(main_frame, text="API 状态", padding="10")
        status_frame.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 10))
        status_frame.columnconfigure(1, weight=1)
        
        ttk.Label(status_frame, text="API地址:").grid(row=0, column=0, sticky=tk.W, padx=(0, 5))
        self.api_label = ttk.Label(status_frame, text=PROXY_BASE_URL, foreground="blue")
        self.api_label.grid(row=0, column=1, sticky=tk.W)
        
        ttk.Label(status_frame, text="延迟:").grid(row=1, column=0, sticky=tk.W, padx=(0, 5))
        self.latency_label = ttk.Label(status_frame, text="检测中...", foreground="orange")
        self.latency_label.grid(row=1, column=1, sticky=tk.W)
        
        link_frame = ttk.LabelFrame(main_frame, text="下载链接", padding="10")
        link_frame.grid(row=1, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 10))
        link_frame.columnconfigure(0, weight=1)
        
        ttk.Label(link_frame, text="CS2 DEMO链接:").grid(row=0, column=0, sticky=tk.W, pady=(0, 5))
        
        self.link_entry = ttk.Entry(link_frame, width=60)
        self.link_entry.grid(row=1, column=0, sticky=(tk.W, tk.E), padx=(0, 5))
        self.link_entry.bind('<Return>', lambda e: self.convert_link())
        
        ttk.Button(link_frame, text="转换链接", command=self.convert_link).grid(row=1, column=1, sticky=tk.W)

        ttk.Label(link_frame, text="代理链接:").grid(row=2, column=0, sticky=tk.W, pady=(10, 5))
        
        self.proxy_link_entry = ttk.Entry(link_frame, width=60, state="readonly")
        self.proxy_link_entry.grid(row=3, column=0, sticky=(tk.W, tk.E), padx=(0, 5))
        
        ttk.Button(link_frame, text="复制链接", command=self.copy_proxy_link).grid(row=3, column=1, sticky=tk.W)

        download_frame = ttk.LabelFrame(main_frame, text="下载设置", padding="10")
        download_frame.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 10))
        download_frame.columnconfigure(0, weight=1)
        
        ttk.Label(download_frame, text="保存位置:").grid(row=0, column=0, sticky=tk.W, pady=(0, 5))
        
        self.path_entry = ttk.Entry(download_frame, width=60)
        self.path_entry.grid(row=1, column=0, sticky=(tk.W, tk.E), padx=(0, 5))
        self.path_entry.insert(0, os.path.join(os.path.expanduser("~"), "Downloads"))
        
        ttk.Button(download_frame, text="选择文件夹", command=self.select_folder).grid(row=1, column=1, sticky=tk.W)
        
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=3, column=0, columnspan=2, pady=(0, 10))
        
        self.download_button = ttk.Button(button_frame, text="开始下载", command=self.start_download, state="disabled")
        self.download_button.pack(side=tk.LEFT, padx=5)
        
        ttk.Button(button_frame, text="清空", command=self.clear_all).pack(side=tk.LEFT, padx=5)
        
        progress_frame = ttk.LabelFrame(main_frame, text="下载进度", padding="10")
        progress_frame.grid(row=4, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 10))
        progress_frame.columnconfigure(0, weight=1)
        
        self.progress_var = tk.StringVar(value="等待下载...")
        ttk.Label(progress_frame, textvariable=self.progress_var).grid(row=0, column=0, sticky=tk.W)
        
        self.progress_bar = ttk.Progressbar(progress_frame, mode='determinate')
        self.progress_bar.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=(5, 0))
        
        log_frame = ttk.LabelFrame(main_frame, text="日志", padding="10")
        log_frame.grid(row=5, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), pady=(0, 0))
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)
        main_frame.rowconfigure(5, weight=1)
        
        self.log_text = tk.Text(log_frame, height=8, wrap=tk.WORD)
        self.log_text.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        scrollbar = ttk.Scrollbar(log_frame, orient=tk.VERTICAL, command=self.log_text.yview)
        scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))
        self.log_text.configure(yscrollcommand=scrollbar.set)
    
    def log(self, message):
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        self.log_text.insert(tk.END, f"[{timestamp}] {message}\n")
        self.log_text.see(tk.END)
        self.root.update_idletasks()
    
    def wait_for_api_and_show_copyright(self, max_wait=10, current_wait=0):
        if self.copyright_shown:
            return
        
        if self.supported_servers or current_wait >= max_wait or not self.latency_label.cget('text') == "检测中...":
            self.show_copyright()
            return
        
        self.root.after(200, lambda: self.wait_for_api_and_show_copyright(max_wait, current_wait + 1))
    
    def show_copyright(self):
        if self.copyright_shown:
            return
        
        self.copyright_shown = True
        
        if self.supported_servers:
            servers_text = "\n".join(f"• {s}" for s in self.supported_servers)
        else:
            servers_text = "• 获取失败"
        
        author = self.api_info.get('author', '鼠子 YuiNijika | B站@Tomoriゞ')
        bilibili = self.api_info.get('bilibili', 'https://space.bilibili.com/435502585')
        description = self.api_info.get('description', '专门用于代理CS2 DEMO下载的API服务')
        
        copyright_text = f"""CS2 DEMO 代理下载器

作者: {author}
API服务: {PROXY_BASE_URL}/

{description}
支持以下服务器:
{servers_text}

使用说明:
1. 输入CS2 DEMO的原始下载链接
2. 点击"转换链接"自动转换为代理链接
3. 选择保存位置
4. 点击"开始下载"
"""
        
        messagebox.showinfo("版权信息", copyright_text)
        self.log("应用程序已启动")
    
    def check_api_latency(self):
        def ping_api():
            try:
                start_time = time.time()
                response = self.session.get(PROXY_BASE_URL, timeout=10, allow_redirects=True)
                end_time = time.time()
                
                latency_ms = (end_time - start_time) * 1000
                self.latency = latency_ms
                self.api_available = response.status_code == 200
                
                if self.api_available:
                    try:
                        api_data = response.json()
                        self.api_info = api_data
                        
                        if 'supportedServers' in api_data:
                            self.supported_servers = api_data['supportedServers']
                            self.log(f"已获取支持的服务器列表: {len(self.supported_servers)} 个服务器")
                        else:
                            self.log("警告: API响应中未找到supportedServers字段")
                            self.supported_servers = []
                        
                    except ValueError as e:
                        self.log(f"解析API响应失败: {str(e)}")
                        self.supported_servers = []
                    
                    self.latency_label.config(text=f"{latency_ms:.2f} ms", foreground="green")
                    self.log(f"API延迟检测成功: {latency_ms:.2f} ms")
                    
                    if not self.copyright_shown:
                        self.root.after(100, self.show_copyright)
                else:
                    self.latency_label.config(text="API不可用", foreground="red")
                    self.log(f"API响应异常: HTTP {response.status_code}")
                    if not self.copyright_shown:
                        self.root.after(100, self.show_copyright)
                    
            except requests.exceptions.Timeout:
                self.latency = None
                self.api_available = False
                self.supported_servers = []
                self.latency_label.config(text="超时", foreground="red")
                self.log("API延迟检测超时")
                if not self.copyright_shown:
                    self.root.after(100, self.show_copyright)
                messagebox.showwarning("连接超时", 
                    f"无法连接到API服务器: {PROXY_BASE_URL}\n\n"
                    "请检查:\n"
                    "1. 网络连接是否正常\n"
                    "2. API服务器是否可访问\n"
                    "3. 防火墙设置\n\n"
                    "您可以继续尝试下载，但可能会失败。")
                    
            except requests.exceptions.RequestException as e:
                self.latency = None
                self.api_available = False
                self.supported_servers = []
                self.latency_label.config(text="连接失败", foreground="red")
                self.log(f"API连接失败: {str(e)}")
                if not self.copyright_shown:
                    self.root.after(100, self.show_copyright)
                messagebox.showerror("连接失败", 
                    f"无法连接到API服务器: {PROXY_BASE_URL}\n\n"
                    f"错误信息: {str(e)}\n\n"
                    "请检查网络连接后重试。")
        
        threading.Thread(target=ping_api, daemon=True).start()
    
    def convert_link(self):
        original_link = self.link_entry.get().strip()
        
        if not original_link:
            messagebox.showwarning("输入错误", "请输入CS2 DEMO下载链接")
            return
        
        try:
            parsed = urlparse(original_link)
            hostname = parsed.hostname
            
            if not hostname:
                raise ValueError("无效的URL")

            if not self.supported_servers:
                self.log("服务器列表未加载，尝试重新获取...")
                self.check_api_latency()
                time.sleep(0.5)
            
            if hostname not in self.supported_servers:
                servers_list = "\n".join(f"• {s}" for s in self.supported_servers) if self.supported_servers else "• 正在加载..."
                messagebox.showerror("不支持的服务器", 
                    f"不支持的服务器: {hostname}\n\n"
                    f"支持的服务器:\n{servers_list}\n\n"
                    "如果服务器列表为空，请等待API信息加载完成。")
                return
            
            replay_id = hostname.split('.')[0]
            
            demo_path = parsed.path
            if parsed.query:
                demo_path += f"?{parsed.query}"
            
            proxy_link = f"{PROXY_BASE_URL}/{replay_id}{demo_path}"
            
            self.proxy_link_entry.config(state="normal")
            self.proxy_link_entry.delete(0, tk.END)
            self.proxy_link_entry.insert(0, proxy_link)
            self.proxy_link_entry.config(state="readonly")
            
            self.download_button.config(state="normal")
            
            self.log(f"链接转换成功: {original_link} -> {proxy_link}")
            messagebox.showinfo("转换成功", f"链接已转换为代理链接:\n{proxy_link}")
            
        except Exception as e:
            self.log(f"链接转换失败: {str(e)}")
            messagebox.showerror("转换失败", f"无法转换链接:\n{str(e)}\n\n请检查链接格式是否正确。")
    
    def copy_proxy_link(self):
        proxy_link = self.proxy_link_entry.get()
        if proxy_link:
            self.root.clipboard_clear()
            self.root.clipboard_append(proxy_link)
            self.log("代理链接已复制到剪贴板")
            messagebox.showinfo("复制成功", "代理链接已复制到剪贴板")
        else:
            messagebox.showwarning("无链接", "请先转换链接")
    
    def select_folder(self):
        folder = filedialog.askdirectory(initialdir=self.path_entry.get())
        if folder:
            self.path_entry.delete(0, tk.END)
            self.path_entry.insert(0, folder)
            self.log(f"选择下载位置: {folder}")
    
    def start_download(self):
        proxy_link = self.proxy_link_entry.get()
        save_path = self.path_entry.get()
        
        if not proxy_link:
            messagebox.showwarning("无链接", "请先转换链接")
            return
        
        if not save_path:
            messagebox.showwarning("无保存位置", "请选择保存位置")
            return
        
        try:
            parsed = urlparse(proxy_link)
            filename = os.path.basename(parsed.path)
            if not filename or not filename.endswith('.dem'):
                filename = f"demo_{int(time.time())}.dem"
            
            full_path = os.path.join(save_path, filename)
            
            if os.path.exists(full_path):
                if not messagebox.askyesno("文件已存在", f"文件已存在:\n{full_path}\n\n是否覆盖？"):
                    return
            
            self.download_button.config(state="disabled")
            threading.Thread(target=self.download_file, args=(proxy_link, full_path), daemon=True).start()
            
        except Exception as e:
            self.log(f"下载准备失败: {str(e)}")
            messagebox.showerror("错误", f"下载准备失败:\n{str(e)}")
            self.download_button.config(state="normal")
    
    def download_file(self, url, filepath):
        try:
            self.log(f"开始下载: {url}")
            self.log(f"保存到: {filepath}")
            self.progress_var.set("正在连接...")
            self.progress_bar['value'] = 0
            
            response = self.session.get(url, stream=True, timeout=30, allow_redirects=True)
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            
            if total_size == 0:
                self.log("警告: 无法获取文件大小，使用流式下载")
            
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            
            downloaded = 0
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        if total_size > 0:
                            progress = (downloaded / total_size) * 100
                            self.progress_bar['value'] = progress
                            self.progress_var.set(f"下载中: {downloaded / 1024 / 1024:.2f} MB / {total_size / 1024 / 1024:.2f} MB ({progress:.1f}%)")
                        else:
                            self.progress_var.set(f"下载中: {downloaded / 1024 / 1024:.2f} MB")
                        
                        self.root.update_idletasks()
            
            self.progress_bar['value'] = 100
            self.progress_var.set(f"下载完成: {downloaded / 1024 / 1024:.2f} MB")
            self.log(f"下载完成: {filepath}")
            
            messagebox.showinfo("下载完成", f"文件已成功下载到:\n{filepath}")
            self.download_button.config(state="normal")
            
        except requests.exceptions.Timeout:
            self.log("下载超时")
            self.progress_var.set("下载超时")
            messagebox.showerror("下载失败", "下载超时，请检查网络连接后重试")
            self.download_button.config(state="normal")
            
        except requests.exceptions.RequestException as e:
            self.log(f"下载失败: {str(e)}")
            self.progress_var.set("下载失败")
            messagebox.showerror("下载失败", f"下载失败:\n{str(e)}")
            self.download_button.config(state="normal")
            
        except Exception as e:
            self.log(f"下载错误: {str(e)}")
            self.progress_var.set("下载错误")
            messagebox.showerror("错误", f"下载过程中发生错误:\n{str(e)}")
            self.download_button.config(state="normal")
    
    def clear_all(self):
        self.link_entry.delete(0, tk.END)
        self.proxy_link_entry.config(state="normal")
        self.proxy_link_entry.delete(0, tk.END)
        self.proxy_link_entry.config(state="readonly")
        self.progress_var.set("等待下载...")
        self.progress_bar['value'] = 0
        self.log_text.delete(1.0, tk.END)
        self.log("已清空所有输入")
        self.download_button.config(state="disabled")


def main():
    root = tk.Tk()
    app = CS2DemoDownloader(root)
    root.mainloop()


if __name__ == "__main__":
    main()

