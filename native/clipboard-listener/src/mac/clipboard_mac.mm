#import <Cocoa/Cocoa.h>

#include <atomic>
#include <chrono>
#include <string>
#include <thread>

#include "../clipboard_listener.h"

namespace linkster {
namespace {

std::atomic<bool> g_shouldStop{false};
std::thread g_thread;

void ThreadMain() {
  @autoreleasepool {
    NSInteger lastChange = [[NSPasteboard generalPasteboard] changeCount];

    while (!g_shouldStop.load()) {
      std::this_thread::sleep_for(std::chrono::milliseconds(300));

      NSPasteboard* pasteboard = [NSPasteboard generalPasteboard];
      const NSInteger change = [pasteboard changeCount];
      if (change == lastChange) continue;
      lastChange = change;

      NSString* value = [pasteboard stringForType:NSPasteboardTypeString];
      if (value != nil) {
        const char* utf8 = [value UTF8String];
        if (utf8 != nullptr) {
          EmitClipboardText(std::string(utf8));
        }
      }
    }
  }
}

}  // namespace

bool StartClipboardListener(Napi::ThreadSafeFunction tsfn) {
  (void)tsfn;
  g_shouldStop.store(false);
  g_thread = std::thread(ThreadMain);
  return true;
}

void StopClipboardListener() {
  g_shouldStop.store(true);
  if (g_thread.joinable()) {
    g_thread.join();
  }
}

}  // namespace linkster
