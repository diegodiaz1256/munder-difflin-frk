/** The office is still starting: the orchestrator is being spawned, or its
 *  terminal has not printed anything yet. */
export function officeStarting(godStatus: string | undefined, godPrinted: boolean): boolean {
  if (godStatus === 'failed') return false;
  return godStatus === 'booting' || !godPrinted;
}
