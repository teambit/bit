<pre>
+---------------------+
|     User runs       |
|   bit install CLI   |
+---------+-----------+
          |
          v
+---------------------+
|   Install Aspect    |
| (publishIpcEvent)  |
+---------+-----------+
          |
   Writes ".bit/events/onPostInstall"
          |
          v
+---------------------+
|  File System (FS)   |
|   .bit/events/...   |
+---------+-----------+
          |  (FS notifies watchers)
          |------------------------------+
          |                              |
          |                              |
          v                              v
+---------------------+          +---------------------+
|   bit start         |          |   bit watch         |
|   (watcher)         |          |   (watcher)         |
| Calls:              |          | Calls:              |
|  ipcEvents          |          |  ipcEvents          |
|   .triggerGotEvent  |          |   .triggerGotEvent  |
+---------+-----------+          +---------+-----------+
          |                              |
          |                              |
          |           +------------------+
          v           v
   Registered aspects get notified, for instance:
   - Clearing component issues
   - Performing post-install tasks
</pre>
