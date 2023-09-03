var mod_child_process = require('child_process');

export class ProcessManager {
  private static processes: Map<string, any> = new Map();

  public static startProcess(command: string, args: string[], alias?: string) {
    let process = mod_child_process.spawn(command, args);
    var name = alias ? alias : command;
    ProcessManager.processes.set(name, process);
    process.on('exit', () => {
      ProcessManager.processes.delete(name);
    });
    process.on('error', () => {
      ProcessManager.processes.delete(name);
    });
    return process;
  }

  public static getProcess(name: string) {
    return ProcessManager.processes.get(name);
  }

  public static killProcess(name: string) {
    let process = ProcessManager.getProcess(name);
    if (process) {
      process.kill();
    }
  }

  public static killAllProcesses() {
    ProcessManager.processes.forEach((process) => {
      process.kill();
    });
  }
}
