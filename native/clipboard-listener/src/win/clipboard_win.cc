#include "../clipboard_listener.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <atomic>
#include <string>
#include <thread>

namespace linkster {
namespace {

std::atomic<bool> g_shouldStop{false};
std::atomic<bool> g_ready{false};
std::thread g_thread;
DWORD g_threadId = 0;
HWND g_messageWindow = nullptr;

std::string ReadClipboardText() {
  std::string result;
  if (!OpenClipboard(g_messageWindow)) return result;

  HANDLE handle = GetClipboardData(CF_UNICODETEXT);
  if (handle != nullptr) {
    auto* wide = static_cast<wchar_t*>(GlobalLock(handle));
    if (wide != nullptr) {
      const int length =
          WideCharToMultiByte(CP_UTF8, 0, wide, -1, nullptr, 0, nullptr, nullptr);
      if (length > 1) {
        result.resize(static_cast<size_t>(length - 1));
        WideCharToMultiByte(CP_UTF8, 0, wide, -1, result.data(), length, nullptr,
                            nullptr);
      }
      GlobalUnlock(handle);
    }
  }

  CloseClipboard();
  return result;
}

LRESULT CALLBACK WndProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
  if (message == WM_CLIPBOARDUPDATE) {
    const std::string text = ReadClipboardText();
    if (!text.empty()) {
      EmitClipboardText(text);
    }
    return 0;
  }
  return DefWindowProcW(hwnd, message, wParam, lParam);
}

void ThreadMain() {
  g_threadId = GetCurrentThreadId();

  WNDCLASSEXW windowClass = {};
  windowClass.cbSize = sizeof(WNDCLASSEXW);
  windowClass.lpfnWndProc = WndProc;
  windowClass.hInstance = GetModuleHandleW(nullptr);
  windowClass.lpszClassName = L"LinksterClipboardListenerWindow";
  RegisterClassExW(&windowClass);

  g_messageWindow = CreateWindowExW(0, windowClass.lpszClassName, L"", 0, 0, 0, 0,
                                    0, HWND_MESSAGE, nullptr, windowClass.hInstance,
                                    nullptr);
  if (g_messageWindow == nullptr) {
    UnregisterClassW(windowClass.lpszClassName, windowClass.hInstance);
    return;
  }

  AddClipboardFormatListener(g_messageWindow);
  g_ready.store(true);

  MSG message;
  while (!g_shouldStop.load() && GetMessageW(&message, nullptr, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }

  RemoveClipboardFormatListener(g_messageWindow);
  DestroyWindow(g_messageWindow);
  g_messageWindow = nullptr;
  UnregisterClassW(windowClass.lpszClassName, windowClass.hInstance);
}

}  // namespace

bool StartClipboardListener(Napi::ThreadSafeFunction tsfn) {
  (void)tsfn;
  g_shouldStop.store(false);
  g_ready.store(false);
  g_thread = std::thread(ThreadMain);

  for (int attempt = 0; attempt < 200 && !g_ready.load(); ++attempt) {
    Sleep(10);
  }
  return g_ready.load();
}

void StopClipboardListener() {
  g_shouldStop.store(true);
  if (g_threadId != 0) {
    PostThreadMessageW(g_threadId, WM_QUIT, 0, 0);
  }
  if (g_thread.joinable()) {
    g_thread.join();
  }
  g_threadId = 0;
}

}  // namespace linkster
