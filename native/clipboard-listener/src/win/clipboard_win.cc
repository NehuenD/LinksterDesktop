#include "../clipboard_listener.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <string>
#include <thread>

namespace linkster {
namespace {

std::atomic<bool> g_shouldStop{false};
std::atomic<bool> g_ready{false};
std::atomic<bool> g_startSuccess{false};
std::thread g_thread;
DWORD g_threadId = 0;
HWND g_messageWindow = nullptr;
std::mutex g_readyMutex;
std::condition_variable g_readyCv;

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
    {
      std::lock_guard<std::mutex> lock(g_readyMutex);
      g_ready.store(true);
    }
    g_readyCv.notify_all();
    return;
  }

  if (!AddClipboardFormatListener(g_messageWindow)) {
    // Without the listener the loop would spin with no events: report failure
    // so the JS layer falls back to polling instead of pretending to work.
    DestroyWindow(g_messageWindow);
    g_messageWindow = nullptr;
    UnregisterClassW(windowClass.lpszClassName, windowClass.hInstance);
    {
      std::lock_guard<std::mutex> lock(g_readyMutex);
      g_ready.store(true);
    }
    g_readyCv.notify_all();
    return;
  }

  {
    std::lock_guard<std::mutex> lock(g_readyMutex);
    g_startSuccess.store(true);
    g_ready.store(true);
  }
  g_readyCv.notify_all();

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

  // Never assign over a joinable thread: that calls std::terminate.
  if (g_thread.joinable()) {
    g_shouldStop.store(true);
    g_thread.join();
  }

  g_shouldStop.store(false);
  g_ready.store(false);
  g_startSuccess.store(false);
  g_thread = std::thread(ThreadMain);

  {
    std::unique_lock<std::mutex> lock(g_readyMutex);
    g_readyCv.wait_for(lock, std::chrono::seconds(2), [] { return g_ready.load(); });
  }
  return g_startSuccess.load();
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
