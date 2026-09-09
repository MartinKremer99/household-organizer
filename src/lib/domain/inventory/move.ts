import { err, ok, type DomainResult } from "../result";
import { isPositiveInteger } from "./stock";

export type MoveInput = {
  sourceLocationId: string;
  destinationLocationId: string;
  quantity: number;
  sourceQuantity: number;
};

export type MoveDeltas = {
  move_out_delta: number;
  move_in_delta: number;
};

export function validateMove(input: MoveInput): DomainResult<MoveDeltas> {
  if (input.sourceLocationId === input.destinationLocationId) {
    return err("invalid_move");
  }

  if (
    !isPositiveInteger(input.quantity) ||
    !Number.isInteger(input.sourceQuantity) ||
    input.sourceQuantity < 0
  ) {
    return err("invalid_quantity");
  }

  if (input.sourceQuantity < input.quantity) {
    return err("insufficient_stock");
  }

  return ok({
    move_out_delta: -input.quantity,
    move_in_delta: input.quantity,
  });
}
