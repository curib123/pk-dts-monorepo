import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { REQUIRED_PERMISSIONS_KEY } from "../../../common/auth/require-permissions.decorator";
import { DOCUMENT_APPROVAL_PERMISSIONS } from "../../../common/auth/document-workflow-permissions";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

describe("DocumentsController update permissions", () => {
  const update = jest.fn();
  const updateRequest = jest.fn();
  const controller = new DocumentsController({
    update,
    updateRequest,
  } as unknown as DocumentsService);

  beforeEach(() => jest.clearAllMocks());

  it("allows documents.edit to use the unrestricted document update path", () => {
    const user = authenticatedUser(["documents.edit"]);

    controller.update("42", { document_title: "Updated" }, user);

    expect(update).toHaveBeenCalledWith("42", {
      document_title: "Updated",
      action: undefined,
    }, user);
    expect(updateRequest).not.toHaveBeenCalled();
  });

  it("keeps request-only editors on the creator and workflow guarded path", () => {
    const user = authenticatedUser(["document-requests.edit"]);
    const dto = { document_title: "Request update" };

    controller.update("42", dto, user);

    expect(updateRequest).toHaveBeenCalledWith("42", dto, "7", user);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("DocumentsController workflow decision permissions", () => {
  it("requires an approval capability before an assigned user can approve", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        DocumentsController.prototype.approve,
      ),
    ).toEqual([...DOCUMENT_APPROVAL_PERMISSIONS]);
  });

  it("requires request-revision permission before an assigned user can return a request", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        DocumentsController.prototype.requestRevision,
      ),
    ).toEqual(["document-requests.request-revision"]);
  });

  it("requires reject permission before an assigned user can reject", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        DocumentsController.prototype.reject,
      ),
    ).toEqual(["document-requests.reject"]);
  });
});

describe("DocumentsController disposal identity", () => {
  const dispose = jest.fn();
  const controller = new DocumentsController({ dispose } as unknown as DocumentsService);

  beforeEach(() => jest.clearAllMocks());

  it("allows an administrator to select the disposal user", () => {
    const user = authenticatedUser([], "Admin");
    controller.dispose("42", { disposal_remarks: "Approved", disposed_by_user_id: "99" }, user);
    expect(dispose).toHaveBeenCalledWith("42", { disposal_remarks: "Approved", disposed_by_user_id: "99" }, user);
  });

  it("prevents non-administrators from disposing directly", () => {
    const user = authenticatedUser(["documents.dispose"], "Staff");
    expect(() => controller.dispose("42", { disposal_remarks: "Approved", disposed_by_user_id: "99" }, user)).toThrow(
      "Only administrators can dispose documents directly",
    );
    expect(dispose).not.toHaveBeenCalled();
  });
});

describe("DocumentsController disposal listing", () => {
  const findAll = jest.fn();
  const controller = new DocumentsController({ findAll } as unknown as DocumentsService);

  beforeEach(() => jest.clearAllMocks());

  it("requests disposed documents for the disposal workspace", () => {
    const user = authenticatedUser(["document-disposal.view"], "Admin");
    const query = { page: 1, limit: 10 };

    controller.findDisposed(query, user);

    expect(findAll).toHaveBeenCalledWith(query, ["Disposed"], user);
  });
});

function authenticatedUser(permissions: string[], roleName = "Editor"): AuthenticatedUser {
  return {
    user_id: "7",
    username: "editor@example.com",
    firstname: "Document",
    lastname: "Editor",
    require_password_change: false,
    role: { role_id: "2", role_name: roleName, permissions },
  };
}
