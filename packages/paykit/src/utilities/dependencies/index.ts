import { checkDependencies } from "./check-dependencies";
import { PAYKIT_PACKAGE_LIST } from "./paykit-package-list";

export function checkPayKitDependencies(): Promise<void> {
  return checkDependencies([...PAYKIT_PACKAGE_LIST], "paykitjs");
}
