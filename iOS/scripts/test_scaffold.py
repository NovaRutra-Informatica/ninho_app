"""Portable checks of the delivered scaffold, not an Xcode/iOS build."""
import copy
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
import generate_project as generator
import select_simulator as simulator


class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.project = generator.project()
        self.objects = self.project["objects"]

    def test_generated_files_match_exactly(self):
        for path, data in generator.outputs().items():
            self.assertEqual(path.read_bytes(), data, str(path))

    def test_all_object_references_resolve(self):
        def inspect(value):
            if isinstance(value, dict):
                for child in value.values():
                    inspect(child)
            elif isinstance(value, list):
                for child in value:
                    inspect(child)
            elif isinstance(value, str) and len(value) == 24 and all(c in "ABCDEF0123456789" for c in value):
                self.assertIn(value, self.objects)
        inspect(self.project)

    def test_targets_share_swift6_ios26_iphone_only(self):
        for name in ("Debug", "Release"):
            settings = self.objects[generator.identifier(f"config.project.{name}")]["buildSettings"]
            self.assertEqual(settings["IPHONEOS_DEPLOYMENT_TARGET"], "26.0")
            self.assertEqual(settings["SWIFT_VERSION"], "6.0")
            self.assertEqual(settings["TARGETED_DEVICE_FAMILY"], "1")

    def test_test_targets_are_wired_to_app_and_core(self):
        for name in ("NinhoTests", "NinhoUITests"):
            target = self.objects[generator.identifier(f"target.{name}")]
            dependency = self.objects[target["dependencies"][0]]
            self.assertEqual(dependency["target"], generator.identifier("target.Ninho"))
        package = self.objects[generator.identifier("package")]
        self.assertEqual(package["relativePath"], ".")
        for name in ("Ninho", "NinhoTests"):
            product = self.objects[generator.identifier(f"package-product.{name}")]
            self.assertEqual(product["productName"], "NinhoCore")

    def test_signing_has_no_private_team_and_no_ipad_target(self):
        for name in ("Ninho", "NinhoTests", "NinhoUITests"):
            for config in ("Debug", "Release"):
                settings = self.objects[generator.identifier(f"config.{name}.{config}")]["buildSettings"]
                self.assertEqual(settings["DEVELOPMENT_TEAM"], "")
                self.assertEqual(settings["CODE_SIGN_STYLE"], "Automatic")
                self.assertEqual(settings["SUPPORTS_MACCATALYST"], "NO")

    def test_scheme_runs_both_test_targets_without_skips(self):
        scheme = ET.fromstring(generator.scheme())
        tests = scheme.findall("TestAction/Testables/TestableReference")
        self.assertEqual(len(tests), 2)
        self.assertEqual({item.find("BuildableReference").get("BlueprintName") for item in tests}, {"NinhoTests", "NinhoUITests"})
        self.assertTrue(all(item.get("skipped") == "NO" for item in tests))
        self.assertEqual(scheme.find("TestAction/EnvironmentVariables/EnvironmentVariable").get("value"), "unit-host")
        self.assertIsNone(scheme.find("LaunchAction/CommandLineArguments"))

    def test_manual_workflow_does_not_trigger_on_push_or_sign(self):
        text = (generator.ROOT.parent / ".github/workflows/ios.yml").read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        self.assertNotIn("pull_request:", text)
        self.assertNotIn("push:", text)
        self.assertNotIn("secrets.", text)


class SimulatorTests(unittest.TestCase):
    def setUp(self):
        self.runtime = "com.apple.CoreSimulator.SimRuntime.iOS-26-0"
        self.inventory = {"runtimes": [{"identifier": self.runtime, "version": "26.0", "isAvailable": True}], "devices": {self.runtime: []}}

    def device(self, name=simulator.NAME, **changes):
        return {"name": name, "udid": "qa-device", "isAvailable": True, "deviceTypeIdentifier": simulator.DEVICE_TYPE, **changes}

    def test_creates_separate_device_instead_of_reusing_personal_phone(self):
        self.inventory["devices"][self.runtime] = [self.device("My iPhone")]
        self.assertEqual(simulator.select(self.inventory), (None, self.runtime))

    def test_reuses_available_dedicated_device(self):
        self.inventory["devices"][self.runtime] = [self.device()]
        self.assertEqual(simulator.select(self.inventory), ("qa-device", None))

    def test_does_not_reuse_missing_runtime(self):
        self.inventory["runtimes"][0]["isAvailable"] = False
        self.inventory["devices"][self.runtime] = [self.device()]
        with self.assertRaises(ValueError):
            simulator.select(self.inventory)

    def test_override_rejects_wrong_type_old_os_or_unknown_uuid(self):
        cases = [self.device(deviceTypeIdentifier="iPad"), self.device(isAvailable=False)]
        for device in cases:
            self.inventory["devices"][self.runtime] = [device]
            with self.assertRaises(ValueError):
                simulator.select(self.inventory, "qa-device")
        self.inventory["devices"][self.runtime] = [self.device()]
        with self.assertRaises(ValueError):
            simulator.select(self.inventory, "unknown")
        self.inventory["runtimes"][0]["version"] = "18.5"
        with self.assertRaises(ValueError):
            simulator.select(self.inventory, "qa-device")

    def test_newest_available_ios_runtime_is_selected_numerically(self):
        for value in ("26.2", "26.10", "27.0"):
            self.inventory["runtimes"].append({"identifier": f"com.apple.CoreSimulator.SimRuntime.iOS-{value.replace('.', '-')}", "version": value, "isAvailable": value != "27.0"})
        self.assertTrue(simulator.select(self.inventory)[1].endswith("26-10"))

    def test_explicit_available_phone_override_is_honored(self):
        self.inventory["devices"][self.runtime] = [self.device("Explicit QA phone")]
        self.assertEqual(simulator.select(self.inventory, "qa-device"), ("qa-device", None))


if __name__ == "__main__":
    unittest.main()
