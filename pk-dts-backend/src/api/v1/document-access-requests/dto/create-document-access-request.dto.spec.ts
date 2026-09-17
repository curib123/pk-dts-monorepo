import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateDocumentAccessRequestDto } from "./create-document-access-request.dto";

describe("CreateDocumentAccessRequestDto", () => {
  it("requires a nonblank access reason", async () => {
    const empty = plainToInstance(CreateDocumentAccessRequestDto, {
      document_id: "42",
      request_reason: "",
    });
    const whitespace = plainToInstance(CreateDocumentAccessRequestDto, {
      document_id: "42",
      request_reason: "   ",
    });

    expect(await validate(empty)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "request_reason" }),
      ]),
    );
    expect(await validate(whitespace)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "request_reason" }),
      ]),
    );
  });
});
