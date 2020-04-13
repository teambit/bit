Logger
========
Logger is in RFC phase and provides only initial check list

** Problem Description **

This extension provides a logging API for bit extensions. it solves several logging related problems:
 - Power the reporter extension.
 - Reusable logger across extensions.
 - Play well legacy logger - write to debug, exception log.
 - Write to extension.log

** Interface ** consult `Logger.ts
** Commands ** no new commands.
** Failing Test ** consult `logger.spec.ts`
** Users ** Reporter extension
** Related issues *** #2544 #2280

Open issue: Should extension mention who he is when logging or get and instance of the logger with
this baked inside.


