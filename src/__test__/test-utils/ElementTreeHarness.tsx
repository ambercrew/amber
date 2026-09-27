import { NodeDto } from "../../api/elements/dto/nodeDto";
import ElementTree from "../../features/Sidebar/components/ElementTree/ElementTree";
import { useElementTreeState } from "../../features/Sidebar/hooks/useElementTreeState";

/** Renders the tree with the state the sidebar would own for it. */
export default function ElementTreeHarness({ tree }: { tree: NodeDto[] }) {
	return <ElementTree state={useElementTreeState(tree)} />;
}
